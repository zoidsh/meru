import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import {
  createGmailDelegatedAccountUrl,
  GMAIL_DELEGATED_ACCOUNT_URL_REGEXP,
  GMAIL_PRELOAD_ARGUMENTS,
  GMAIL_URL,
  type GmailAction,
  type GmailInboxMessage,
  diffInboxFeed,
  filterNewMailIdsByImportance,
  generateGmailLabelColorsCss,
  gmailFeedUrl,
  parseGmailMessageId,
} from "@meru/shared/gmail";
import { ms } from "@meru/shared/ms";
import { GMAIL_TAB_ID } from "@meru/shared/tabs";
import { clamp, wait } from "@meru/shared/utils";
import type { SupportedWorkspaceApp } from "@meru/shared/workspace-apps";
import { extractVerificationCode } from "@meru/verification-code";
import {
  app,
  BrowserWindow,
  type Session,
  type WebContentsView,
  type WebContentsViewConstructorOptions,
} from "electron";
import z from "zod";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { ipc } from "@/ipc";
import { copyText } from "@/lib/clipboard";
import { loadUrl } from "@/lib/load-url";
import { log } from "@/lib/log";
import {
  createChildWebContentsView,
  logLoadFailures,
  openViewDevToolsOnLaunch,
  removeWebContentsListeners,
} from "@/lib/web-contents";
import { getPreloadPath } from "@/lib/window";
import { xmlParser } from "@/lib/xml";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import {
  createNewEmailNotification,
  createNotification,
  isWithinNotificationTimes,
} from "@/notifications";
import { registerTabBroadcasts } from "@/tabs";
import { appTray } from "@/tray";
import { MAX_ZOOM_FACTOR, MIN_ZOOM_FACTOR, WorkspaceApp } from "@/workspace-app";
import gmailCSS from "./gmail.css";
import meruCSS from "./meru.css";

export const GMAIL_USER_STYLES_PATH = path.join(app.getPath("userData"), "gmail-user-styles.css");

const GMAIL_USER_STYLES: string | null = fs.existsSync(GMAIL_USER_STYLES_PATH)
  ? fs.readFileSync(GMAIL_USER_STYLES_PATH, "utf-8")
  : null;

const inboxFeedEntryAuthorSchema = z.object({
  name: z.coerce.string(),
  email: z.string(),
});

const inboxFeedEntrySchema = z.object({
  title: z.coerce.string(),
  summary: z.coerce.string(),
  link: z.object({
    "@_href": z.string(),
  }),
  modified: z.string(),
  issued: z.string(),
  id: z.string(),
  author: inboxFeedEntryAuthorSchema,
  contributor: z
    .union([inboxFeedEntryAuthorSchema, z.array(inboxFeedEntryAuthorSchema)])
    .optional(),
});

const inboxFeedSchema = z.object({
  feed: z.object({
    title: z.string(),
    tagline: z.string(),
    fullcount: z.number(),
    modified: z.string(),
    entry: z.union([inboxFeedEntrySchema, z.array(inboxFeedEntrySchema)]).optional(),
  }),
});

const inboxTypeSchema = z.string();

/*
 * The fallback for a Gmail push channel that is down: it reconnects with
 * exponential backoff after a network gap and can stay down for minutes, and
 * Gmail's own timer syncs the view only every five minutes. While the channel
 * is healthy it still delivers in seconds, so this poll notices nothing.
 * Thirty seconds keeps the worst case lag behind a phone to about half a
 * minute, for two small feed requests a minute per account.
 */
const INBOX_FEED_POLL_INTERVAL = ms("30s");

/*
 * Generous because an entry's `issued` time has not been verified to be
 * Gmail's receive time rather than the sender's `Date` header, and because the
 * seen-id guard already excludes almost every re-filed email, so widening this
 * costs little.
 */
const INBOX_FEED_SLACK = ms("5m");

const HANDLE_MESSAGE_TIMEOUT = ms("15s");

const NEW_EMAIL_NOTIFICATION_ACTIONS = [
  { text: "Archive", action: "archive" },
  { text: "Mark as Read", action: "markAsRead" },
  { text: "Delete", action: "delete" },
  { text: "Mark as Spam", action: "markAsSpam" },
] as const satisfies { text: string; action: GmailAction }[];

export class Gmail {
  /**
   * Keyed by request rather than held per instance, because the reply comes
   * back through the one collection-level handler in `ipc.init()`.
   */
  private static pendingMessageHandlings = new Map<string, (success: boolean) => void>();

  accountId: string;

  app: SupportedWorkspaceApp = "gmail";

  url: string;

  baseUrl: string;

  session: Session;

  private additionalArguments: string[];

  private _view: WebContentsView | undefined;

  get view() {
    if (!this._view) {
      throw new Error("View has not been created yet");
    }

    return this._view;
  }

  set view(view: WebContentsView) {
    this._view = view;
  }

  get isLoading() {
    return this._view ? this._view.webContents.isLoading() : false;
  }

  get navigationHistory() {
    if (!this._view) {
      return { canGoBack: false, canGoForward: false };
    }

    return {
      canGoBack: this._view.webContents.navigationHistory.canGoBack(),
      canGoForward: this._view.webContents.navigationHistory.canGoForward(),
    };
  }

  private pageTitle = "";

  private htmlFullscreen = false;

  get title() {
    return WorkspaceApp.resolveTitle(this.pageTitle, this.app);
  }

  get messageId() {
    const gmailUrl = this._view?.webContents.getURL();

    if (!gmailUrl) {
      return null;
    }

    return parseGmailMessageId(new URL(gmailUrl).hash);
  }

  userEmail: string | null = null;

  unreadCountEnabled = true;

  unifiedInboxEnabled = true;

  store = createStore(
    subscribeWithSelector<{
      unreadCount: number;
      outOfOffice: boolean;
      attentionRequired: boolean;
    }>(() => ({
      unreadCount: 0,
      outOfOffice: false,
      attentionRequired: false,
    })),
  );

  private labelColorsCssKey: string | null = null;

  private inboxFeedBaseline: { url: string; ids: Set<string>; readAt: number } | null = null;

  private seenInboxFeedEntryIds = new Set<string>();

  private inboxFeedPollInterval: NodeJS.Timeout;

  private storeUnsubscribers: (() => void)[] = [];

  private extensionsLoaded: Promise<void> | undefined;

  constructor({
    accountId,
    session,
    unreadCountEnabled,
    unifiedInboxEnabled,
    delegatedAccountId,
    extensionsLoaded,
  }: {
    accountId: string;
    session: Session;
    unreadCountEnabled: boolean;
    unifiedInboxEnabled: boolean;
    delegatedAccountId: string | null;
    extensionsLoaded?: Promise<void>;
  }) {
    const additionalArguments: string[] = [];

    if (config.get("gmail.hideGmailLogo")) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hideGmailLogo);
    }

    if (config.get("gmail.hideInboxFooter")) {
      additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hideInboxFooter);
    }

    if (licenseKey.isValid) {
      if (config.get("gmail.reverseConversation")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.reverseConversation);
      }

      if (config.get("gmail.openComposeInNewWindow")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.openComposeInNewWindow);
      }

      if (config.get("gmail.showSenderIcons")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.showSenderIcons);
      }

      if (config.get("gmail.hideOutOfOfficeBanner")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hideOutOfOfficeBanner);
      }

      if (config.get("gmail.hidePromoBanner")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hidePromoBanner);
      }

      if (config.get("gmail.hideUpgradeButton")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.hideUpgradeButton);
      }

      if (config.get("gmail.moveAttachmentsToTop")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.moveAttachmentsToTop);
      }

      if (config.get("gmail.closeComposeWindowAfterSend")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.closeComposeWindowAfterSend);
      }

      if (config.get("gmail.replyForwardInPopOut")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.replyForwardInPopOut);
      }

      if (config.get("gmail.extendDarkTheme")) {
        additionalArguments.push(GMAIL_PRELOAD_ARGUMENTS.extendDarkTheme);
      }
    }

    this.accountId = accountId;

    this.url = delegatedAccountId ? createGmailDelegatedAccountUrl(delegatedAccountId) : GMAIL_URL;

    this.baseUrl = new URL(this.url).origin;

    this.session = session;

    this.additionalArguments = additionalArguments;

    this.extensionsLoaded = extensionsLoaded;

    this.unreadCountEnabled = unreadCountEnabled;

    this.unifiedInboxEnabled = unifiedInboxEnabled;

    this.subscribeToStore();

    // Without a poll of its own, the baseline's `readAt` would sit hours behind
    // the feed through a quiet period, and the slack window with it.
    this.inboxFeedPollInterval = setInterval(() => {
      if (!this._view) {
        return;
      }

      this.fetchInboxFeed({ retryWhileUnchanged: false });
    }, INBOX_FEED_POLL_INTERVAL);
  }

  async createView(options?: WebContentsViewConstructorOptions) {
    this.view = createChildWebContentsView({
      session: this.session,
      preload: getPreloadPath("gmail"),
      additionalArguments: this.additionalArguments,
      viewOptions: options,
      attachView: (view) => {
        main.window.contentView.addChildView(view);
      },
      getFindInPageTargetWebContents: () => main.window.webContents,
      registerWindowOpenHandler: (view) => {
        this.registerWindowOpenHandler(view);
      },
    });

    this.registerNavigationHandler(this.view);

    logLoadFailures(this.view.webContents, "Gmail view");

    this.updateViewBounds();

    this.view.webContents.once("did-navigate", () => {
      this.applyPersistedZoomFactor();
    });

    this.view.webContents.on("dom-ready", () => {
      if (this.view.webContents.getURL().startsWith(GMAIL_URL)) {
        this.view.webContents.insertCSS(gmailCSS);

        if (licenseKey.isValid && GMAIL_USER_STYLES) {
          this.view.webContents.insertCSS(GMAIL_USER_STYLES);
        }

        this.labelColorsCssKey = null;

        this.applyLabelColors();

        this.fetchInboxFeed();
      }

      this.view.webContents.insertCSS(meruCSS);
    });

    this.view.webContents.on("page-title-updated", (_event, pageTitle, explicitSet) => {
      this.pageTitle = explicitSet ? pageTitle : "";
    });

    this.view.webContents.on("enter-html-full-screen", () => {
      this.setHtmlFullscreen(true);
    });

    this.view.webContents.on("leave-html-full-screen", () => {
      this.setHtmlFullscreen(false);
    });

    registerTabBroadcasts(this.view);

    openViewDevToolsOnLaunch(this.view);

    // An extension that finishes loading while a navigation is still provisional
    // makes Chromium abort that navigation, leaving the view empty
    await this.extensionsLoaded;

    if (!this._view || this._view.webContents.isDestroyed()) {
      return;
    }

    const loaded = await loadUrl(this.view.webContents, this.url);

    if (loaded || !this._view || this._view.webContents.isDestroyed()) {
      return;
    }

    log.info("Retrying Gmail load", { url: this.url });

    await loadUrl(this.view.webContents, this.url);
  }

  async applyLabelColors() {
    if (!this._view) {
      return;
    }

    if (this.labelColorsCssKey) {
      await this.view.webContents.removeInsertedCSS(this.labelColorsCssKey);

      this.labelColorsCssKey = null;
    }

    if (!licenseKey.isValid) {
      return;
    }

    const css = generateGmailLabelColorsCss(config.get("gmail.labelColors"));

    if (css) {
      this.labelColorsCssKey = await this.view.webContents.insertCSS(css);
    }
  }

  private registerNavigationHandler(window: BrowserWindow | WebContentsView) {
    window.webContents.on("did-navigate", (_event, url) => {
      WorkspaceApp.handleNavigate(url, this.session);

      if (window === this.view) {
        this.store.setState({
          attentionRequired: !url.startsWith(this.baseUrl),
        });
      }
    });

    window.webContents.on("will-redirect", (event, url) => {
      if (url.startsWith("https://workspace.google.com/u/0/marketplace/appfinder")) {
        return;
      }

      WorkspaceApp.handleRedirect(event, url, window.webContents);
    });
  }

  private setHtmlFullscreen(htmlFullscreen: boolean) {
    this.htmlFullscreen = htmlFullscreen;

    this.updateViewBounds();
  }

  updateViewBounds() {
    // The window is listened to from before the views exist, so a resize can
    // arrive with nothing here yet to lay out.
    if (!this._view) {
      return;
    }

    const { width, height } = main.getWindowBounds();

    if (this.htmlFullscreen) {
      this.view.setBounds({ x: 0, y: 0, width, height });

      return;
    }

    const verticalTabsWidth = accounts.getVerticalTabsWidth();

    this.view.setBounds({
      x: verticalTabsWidth,
      y: APP_TITLEBAR_HEIGHT,
      width: width - verticalTabsWidth,
      height: height - APP_TITLEBAR_HEIGHT,
    });
  }

  zoomIn() {
    this.updateZoomFactor(this.persistedZoomFactor + 0.1);
  }

  zoomOut() {
    this.updateZoomFactor(this.persistedZoomFactor - 0.1);
  }

  resetZoom() {
    this.updateZoomFactor(1);
  }

  private get persistedZoomFactor() {
    return config.get("workspaceApps.zoomFactors").gmail ?? 1;
  }

  private updateZoomFactor(zoomFactor: number) {
    const clampedZoomFactor = clamp(zoomFactor, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);

    const zoomFactors = { ...config.get("workspaceApps.zoomFactors") };

    if (clampedZoomFactor === 1) {
      delete zoomFactors.gmail;
    } else {
      zoomFactors.gmail = clampedZoomFactor;
    }

    config.set("workspaceApps.zoomFactors", zoomFactors);
  }

  applyPersistedZoomFactor() {
    if (!this._view) {
      return;
    }

    this.view.webContents.setZoomFactor(
      clamp(this.persistedZoomFactor, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR),
    );
  }

  destroy() {
    removeWebContentsListeners(this.view.webContents);

    this.view.webContents.close();

    this.view.removeAllListeners();

    main.window.contentView.removeChildView(this.view);

    clearInterval(this.inboxFeedPollInterval);

    for (const unsubscribe of this.storeUnsubscribers) {
      unsubscribe();
    }

    this.storeUnsubscribers = [];

    this._view = undefined;
  }

  private setDelegatedAccountId(delegatedAccountId: string | null) {
    config.set(
      "accounts",
      config.get("accounts").map((account) => {
        if (account.id === this.accountId) {
          return {
            ...account,
            gmail: {
              ...account.gmail,
              delegatedAccountId,
            },
          };
        }

        return account;
      }),
    );
  }

  registerWindowOpenHandler(window: BrowserWindow | WebContentsView) {
    window.webContents.setWindowOpenHandler((details) => {
      const { url, disposition } = details;

      if (url.startsWith(GMAIL_URL) && disposition !== "background-tab") {
        const gmailDelegatedAccountId = url.match(GMAIL_DELEGATED_ACCOUNT_URL_REGEXP)?.[1];

        if (gmailDelegatedAccountId) {
          loadUrl(window.webContents, url);

          this.setDelegatedAccountId(gmailDelegatedAccountId);

          return { action: "deny" };
        }

        if (url === `${GMAIL_URL}/`) {
          loadUrl(window.webContents, url);

          const account = accounts.getAccount(this.accountId);

          if (account.config.gmail.delegatedAccountId) {
            this.setDelegatedAccountId(null);
          }

          return { action: "deny" };
        }

        return {
          action: "allow",
          createWindow: (options) => {
            const workspaceApp = new WorkspaceApp({
              accountId: this.accountId,
              url,
              window: { width: 800, height: 600 },
              view: options,
              // Changes nothing today: a pop-out is a `window.open` from the
              // page, so Chromium hosts it in the opener's process and it finds
              // these on that process's command line already. Passed so the
              // pop-out's theme does not depend on where Chromium puts it.
              additionalArguments: this.additionalArguments,
              asWindow: true,
            });

            return workspaceApp.view.webContents;
          },
        };
      }

      return WorkspaceApp.handleWindowOpen({
        accountId: this.accountId,
        details,
        webContents: window.webContents,
      });
    });
  }

  /**
   * Held until the renderer has loaded. The first feed fetches go out before
   * it has registered its listeners, and a send that arrives early is dropped
   * where nothing can notice, leaving that account missing from a unified
   * inbox that has no other way to learn about it.
   *
   * Only the send waits. The baseline, the view refresh and the notifications
   * stay with the fetch that called this, which is why this is not awaited
   * there.
   *
   * A second load is not covered: the promise is already settled, so a
   * renderer that reloads shows an empty unified inbox until each account's
   * feed next changes. Nothing in production reloads the main window, so that
   * is a development-only gap.
   */
  private async sendInboxChanged(messages: GmailInboxMessage[]) {
    await main.rendererReady;

    if (main.window.isDestroyed()) {
      return;
    }

    ipc.renderer.send(main.window.webContents, "gmail.inboxChanged", this.accountId, messages);
  }

  private async retryInboxFeedFetch(
    fetchAttempt: number,
    options: { retryWhileUnchanged: boolean },
  ) {
    if (fetchAttempt > 10) {
      return;
    }

    await wait(ms("1s"));

    // Awaited so that the whole chain is behind one promise, which is what
    // lets `handleMessage` hold its caller until the list has caught up. Every
    // other caller drops the promise, so none of them waits on this.
    await this.fetchInboxFeed(options, fetchAttempt + 1);
  }

  private async fetchImportantFeedEntryIds() {
    try {
      const body = await this.session
        .fetch(`${gmailFeedUrl("important")}?t=${Date.now()}`)
        .then((res) => res.text());

      const { feed } = inboxFeedSchema.parse(xmlParser.parse(body));

      const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];

      return new Set(entries.map(({ id }) => id));
    } catch (error) {
      log.error("Failed to fetch important inbox feed", { error });

      return null;
    }
  }

  async fetchInboxFeed(
    { retryWhileUnchanged = true }: { retryWhileUnchanged?: boolean } = {},
    fetchAttempt = 1,
  ) {
    try {
      if (!this.view.webContents.getURL().startsWith(GMAIL_URL)) {
        if (!this.inboxFeedBaseline) {
          await this.retryInboxFeedFetch(fetchAttempt, { retryWhileUnchanged });
        }

        return;
      }

      const inboxTypeValue = await this.view.webContents.executeJavaScript("window.GM_INBOX_TYPE");

      // The URL is already Gmail's while the page is still loading, such as
      // during sign-in, so the global is missing rather than wrong. Treat that
      // as "not loaded yet": keep waiting for it while there is no baseline to
      // diff against, and otherwise return, the way the URL check above does.
      if (inboxTypeValue === undefined) {
        if (!this.inboxFeedBaseline) {
          await this.retryInboxFeedFetch(fetchAttempt, { retryWhileUnchanged });
        }

        return;
      }

      const inboxType = inboxTypeSchema.parse(inboxTypeValue);

      const feedUrl = gmailFeedUrl(
        inboxType === "SECTIONED" && config.get("gmail.inboxCategoriesToMonitor") === "primary"
          ? "primary"
          : undefined,
      );

      // Taken before the fetch so the anchor is never later than the feed state
      // it describes.
      const readAt = Date.now();

      const body = await this.session.fetch(`${feedUrl}?t=${Date.now()}`).then((res) => res.text());

      const { feed } = inboxFeedSchema.parse(xmlParser.parse(body));

      const feedEntries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];

      // The feed URL is part of the baseline because the inbox type and the
      // monitored categories decide which entries the feed carries at all, so
      // diffing across a change of URL would report every entry as new.
      const baseline = this.inboxFeedBaseline?.url === feedUrl ? this.inboxFeedBaseline : null;

      // The baseline is a set of entry ids rather than a count of them because
      // one message read while another arrives leaves the count unchanged.
      const { changed, newIds } = diffInboxFeed(
        baseline,
        this.seenInboxFeedEntryIds,
        feedEntries.map(({ id, issued }) => ({ id, receivedAt: new Date(issued).getTime() })),
        INBOX_FEED_SLACK,
      );

      // Refreshed even when nothing changed, so the slack window follows the
      // feed rather than the last arrival.
      if (baseline) {
        baseline.readAt = readAt;
      }

      // Every id in the fetch is marked seen before any notification is
      // created, so two fetch chains in flight at once cannot both notify.
      for (const { id } of feedEntries) {
        this.seenInboxFeedEntryIds.add(id);
      }

      // Nothing signalled a change ahead of the idle poll, so there is nothing
      // for it to wait for.
      if (!changed) {
        if (retryWhileUnchanged) {
          await this.retryInboxFeedFetch(fetchAttempt, { retryWhileUnchanged });
        }

        return;
      }

      this.inboxFeedBaseline = {
        url: feedUrl,
        ids: new Set(feedEntries.map(({ id }) => id)),
        readAt,
      };

      const newIdSet = new Set(newIds);

      const messages: GmailInboxMessage[] = [];
      const newMailIndexes: number[] = [];

      for (const [
        index,
        { id, link, title, summary, author, contributor, issued },
      ] of feedEntries.entries()) {
        const messageId = new URLSearchParams(link["@_href"]).get("message_id");
        const receivedAt = new Date(issued).getTime();

        if (!messageId) {
          throw new Error("Message ID not found in inbox feed entry");
        }

        messages.push({
          id: messageId,
          subject: title,
          summary,
          author: {
            name: author.name,
            email: author.email,
          },
          contributors: Array.isArray(contributor) ? contributor : contributor ? [contributor] : [],
          receivedAt,
        });

        if (newIdSet.has(id)) {
          newMailIndexes.push(index);
        }
      }

      // The renderer's query cache is the only copy of this list, so the send
      // is the whole of it: main builds it, hands it over and keeps nothing.
      // Reached only on a changed feed, which is also every account's first
      // fetch, since a missing baseline counts as a change.
      if (licenseKey.isValid && config.get("unifiedInbox.enabled") && this.unifiedInboxEnabled) {
        this.sendInboxChanged(messages);
      }

      if (!baseline) {
        return;
      }

      // Ahead of the notifications, so that the list and the unread badge have
      // caught up by the time one is on screen.
      this.refreshInboxView();

      const account = accounts.getAccount(this.accountId);

      const hasMultipleAccounts = accounts.getAccountConfigs().length > 1;

      // Fetched here rather than alongside the inbox feed so that a poll that
      // brought nothing new, or one whose notifications the gates below drop
      // anyway, costs no second request.
      const notifiesNewMail =
        newMailIndexes.length > 0 &&
        config.get("notifications.enabled") &&
        account.config.notifications &&
        !config.get("doNotDisturb.enabled") &&
        isWithinNotificationTimes();

      const newEmailsToNotifyFor =
        licenseKey.isValid && notifiesNewMail ? config.get("notifications.newEmails") : "all";

      const notifiableFeedEntryIds = filterNewMailIdsByImportance(
        newIds,
        newEmailsToNotifyFor,
        newEmailsToNotifyFor === "important" ? await this.fetchImportantFeedEntryIds() : null,
      );

      for (const newMailIndex of newMailIndexes.reverse()) {
        const newMail = messages[newMailIndex];
        const newMailFeedEntry = feedEntries[newMailIndex];

        if (!newMail || !newMailFeedEntry) {
          throw new Error("New mail not found");
        }

        let notificationTitle: string;

        if (config.get("notifications.showSender")) {
          notificationTitle = hasMultipleAccounts
            ? `[${account.config.label}] ${newMail.author.name}`
            : newMail.author.name;
        } else {
          notificationTitle = account.config.label;
        }

        let subtitle: string | undefined;

        if (platform.isMacOS && config.get("notifications.showSubject")) {
          subtitle = newMail.subject;
        }

        let body: string | undefined;

        if (platform.isMacOS) {
          if (config.get("notifications.showSummary")) {
            body = newMail.summary;
          }
        } else {
          const bodyLines: string[] = [];

          if (config.get("notifications.showSubject")) {
            bodyLines.push(newMail.subject);
          }

          if (config.get("notifications.showSummary")) {
            bodyLines.push(newMail.summary);
          }

          if (bodyLines.length) {
            body = bodyLines.join("\n");
          }
        }

        if (licenseKey.isValid && config.get("verificationCodes.autoCopy")) {
          const verificationCode = extractVerificationCode([newMail.subject, newMail.summary]);

          if (verificationCode) {
            const copyVerificationCode = async () => {
              // Nothing touches the email until the code is actually on the
              // clipboard: Electron 44's `writeText` resolves when the write
              // lands, and marking read or deleting ahead of a write that then
              // failed would lose the code outright.
              if (!(await copyText(verificationCode))) {
                return;
              }

              if (config.get("verificationCodes.autoMarkAsRead")) {
                this.handleMessage(newMail.id, "markAsRead");
              }

              if (config.get("verificationCodes.autoDelete")) {
                this.handleMessage(newMail.id, "delete");
              }
            };

            // Marking as read and deleting ride along with the copy rather than
            // with the detection, so that nothing touches an email the user has
            // not yet acted on.
            const copiesOnNotificationClick =
              config.get("verificationCodes.copyMode") === "notificationClick";

            if (!copiesOnNotificationClick) {
              copyVerificationCode();
            }

            // Clicking a notification's body always activates the app on
            // macOS, and Electron cannot opt out. An action button does not:
            // Electron registers actions without the foreground option, so
            // macOS delivers the press and leaves the user in the app they
            // were signing in to. The body click stays as a fallback that
            // copies too. Linux has no action buttons, so its body says click.
            const hasCopyButton = copiesOnNotificationClick && !platform.isLinux;

            createNotification({
              title: notificationTitle,
              body: hasCopyButton
                ? `Verification code ${verificationCode}`
                : copiesOnNotificationClick
                  ? `Click to copy verification code ${verificationCode}`
                  : `Copied verification code ${verificationCode}`,
              actions: hasCopyButton ? [{ text: "Copy", type: "button" }] : undefined,
              action: hasCopyButton ? copyVerificationCode : undefined,
              click: copiesOnNotificationClick ? copyVerificationCode : undefined,
            });

            continue;
          }
        }

        if (
          !config.get("notifications.enabled") ||
          !account.config.notifications ||
          config.get("doNotDisturb.enabled") ||
          !isWithinNotificationTimes() ||
          !notifiableFeedEntryIds.has(newMailFeedEntry.id)
        ) {
          continue;
        }

        createNewEmailNotification({
          title: notificationTitle,
          subtitle,
          body,
          actions: NEW_EMAIL_NOTIFICATION_ACTIONS.map(({ text }) => ({
            text,
            type: "button" as const,
          })),
          click: () => {
            this.showMessage(newMail.id);
          },
          action: (index) => {
            const notificationAction = NEW_EMAIL_NOTIFICATION_ACTIONS[index];

            if (notificationAction) {
              this.handleMessage(newMail.id, notificationAction.action);
            }
          },
        });
      }
    } catch (error) {
      log.error("Failed to fetch inbox feed", { error });
    }
  }

  /**
   * Gmail binds its Refresh control to a pointer and mouse sequence the
   * preload has to replay, so this is a message rather than a reload: a reload
   * would throw away an open thread and a half-written reply.
   */
  refreshInboxView() {
    if (
      !this._view ||
      this._view.webContents.isDestroyed() ||
      !this._view.webContents.getURL().startsWith(GMAIL_URL)
    ) {
      return;
    }

    ipc.renderer.send(this._view.webContents, "gmail.refreshInbox");
  }

  static resolveMessageHandled(requestId: string, success: boolean) {
    const resolve = Gmail.pendingMessageHandlings.get(requestId);

    if (resolve) {
      Gmail.pendingMessageHandlings.delete(requestId);

      resolve(success);
    }
  }

  /**
   * Resolves once the action has run and the feed has caught up with it, so a
   * caller can hold its own progress until then. Nothing is removed ahead of
   * that: a row taken away optimistically is put back by the next poll, which
   * reads a feed the action has not reached yet.
   */
  async handleMessage(messageId: string, action: GmailAction) {
    // `destroy()` leaves a shown notification alone, so removing the account
    // and then clicking one runs this against a cleared view. Read through
    // `_view` rather than the getter, which throws.
    const view = this._view;

    if (!view || view.webContents.isDestroyed()) {
      return;
    }

    const requestId = randomUUID();

    const success = await new Promise<boolean>((resolve) => {
      // A preload that never answers, because the page navigated away or the
      // view went down mid-request, must not leave a caller waiting for good.
      const timeout = setTimeout(() => {
        Gmail.pendingMessageHandlings.delete(requestId);

        resolve(false);
      }, HANDLE_MESSAGE_TIMEOUT);

      Gmail.pendingMessageHandlings.set(requestId, (handled) => {
        clearTimeout(timeout);

        resolve(handled);
      });

      ipc.renderer.send(view.webContents, "gmail.handleMessage", messageId, action, requestId);
    });

    // A refused action leaves the feed exactly as it was, so the retry loop
    // would spend its ten attempts confirming that nothing happened.
    if (!success) {
      return;
    }

    await this.fetchInboxFeed();
  }

  /**
   * Both halves are needed after a gap: the feed is what notices the mail, the
   * refresh is what makes the stale view show it.
   */
  resyncInbox() {
    if (!this._view) {
      return;
    }

    this.fetchInboxFeed({ retryWhileUnchanged: false });

    this.refreshInboxView();
  }

  getIsUnreadCountEnabled() {
    if (!config.get("accounts.unreadBadge")) {
      return false;
    }

    return this.unreadCountEnabled;
  }

  setUnreadCount(unreadCount: number) {
    if (this.getIsUnreadCountEnabled()) {
      this.store.setState({ unreadCount });
    }
  }

  subscribeToStore() {
    this.storeUnsubscribers.push(
      this.store.subscribe(
        (state) => state.attentionRequired,
        () => {
          accounts.sendAccountsChangedToRenderer();

          accounts.sendTabsChangedToRenderer();
        },
      ),
    );

    if (this.getIsUnreadCountEnabled()) {
      const dockUnreadBadge = config.get("dock.unreadBadge");

      this.storeUnsubscribers.push(
        this.store.subscribe(
          (state) => state.unreadCount,
          () => {
            const totalUnreadCount = accounts.getTotalUnreadCount();

            if (dockUnreadBadge) {
              if (platform.isMacOS && app.dock) {
                app.dock.setBadge(totalUnreadCount ? totalUnreadCount.toString() : "");
              } else if (platform.isLinux) {
                app.badgeCount = totalUnreadCount;
              } else if (platform.isWindows) {
                if (totalUnreadCount) {
                  ipc.renderer.send(
                    main.window.webContents,
                    "taskbar.setOverlayIcon",
                    totalUnreadCount,
                  );
                } else {
                  main.window.setOverlayIcon(null, "");
                }
              }
            }

            appTray.updateUnreadStatus(totalUnreadCount);

            accounts.sendAccountsChangedToRenderer();
          },
        ),
      );
    }
  }

  createComposeWindow(url: string) {
    new WorkspaceApp({
      accountId: this.accountId,
      url: `${GMAIL_URL}/?extsrc=mailto&url=${encodeURIComponent(url)}`,
      window: { width: 800, height: 600 },
      // A view with no opener starts a renderer process of its own, so this
      // window only sees the Gmail switches if they are passed here.
      additionalArguments: [...this.additionalArguments, GMAIL_PRELOAD_ARGUMENTS.composeWindow],
      asWindow: true,
    });
  }

  search(query: string) {
    this.view.webContents.executeJavaScript(`window.location.hash = "#search/${query}"`);
  }

  navigateToHash(urlOrHash: string) {
    const hash = urlOrHash.startsWith("https://") ? new URL(urlOrHash).hash : urlOrHash;

    if (!hash) {
      return;
    }

    this.view.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(hash)}`);
  }

  showMessage(messageId: string) {
    main.navigate("/");

    const account = accounts.getAccount(this.accountId);

    account.instance.tabs.activateTab(GMAIL_TAB_ID);

    if (account.config.selected) {
      accounts.refreshSelectedAccountView();
    } else {
      accounts.selectAccount(this.accountId);
    }

    ipc.renderer.send(this.view.webContents, "gmail.openMessage", messageId);
  }
}
