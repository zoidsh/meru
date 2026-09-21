import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT, GOOGLE_ACCOUNTS_URL } from "@meru/shared/constants";
import {
  createGmailDelegatedAccountUrl,
  createGmailMessageActionRequest,
  GMAIL_DELEGATED_ACCOUNT_URL_REGEXP,
  GMAIL_PRELOAD_ARGUMENTS,
  GMAIL_URL,
  type GmailAction,
  type GmailInboxMessage,
  diffInboxFeed,
  filterNewMailIdsByImportance,
  generateGmailLabelColorsCss,
  gmailFeedUrl,
  parseGmailIdKey,
  parseGmailMessageId,
  resolveInboxFeedUrl,
} from "@meru/shared/gmail";
import { ms } from "@meru/shared/ms";
import type { GmailHashLocation } from "@meru/shared/types";
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
import { accounts, isGmailHibernated } from "@/accounts";
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

  get hasView() {
    return this._view !== undefined;
  }

  /**
   * The view for the paths that have to keep working while the account's Gmail
   * is hibernated, where `view` would throw.
   */
  get viewOrNull() {
    return this._view ?? null;
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

  /**
   * When the account was last selected with its Gmail tab active. The idle
   * sweep keeps it on the clock for as long as that stays true, so the idle
   * time it measures starts the moment the user looks somewhere else.
   */
  lastActiveAt = Date.now();

  /**
   * The mutate endpoint's per-session key, held only for the viewless path.
   * The preload keeps one of its own for the path that runs inside the page.
   */
  private gmailIdKey: string | null = null;

  /** Whether the last feed fetch was refused, so the poll logs the refusal once. */
  private inboxFeedRefused = false;

  /**
   * Whether this account runs on the feed alone. Read afresh each time rather
   * than held, because both the setting and the license behind it change under
   * a running app.
   */
  get isHibernated() {
    const accountConfig = accounts.getAccountConfig(this.accountId);

    return accountConfig !== undefined && isGmailHibernated(accountConfig);
  }

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
      // A hibernated account has no view and no Gmail push channel either, so
      // this poll is the whole of how it learns about mail.
      if (!this._view && !this.isHibernated) {
        return;
      }

      this.fetchInboxFeed({ retryWhileUnchanged: false });
    }, INBOX_FEED_POLL_INTERVAL);
  }

  async createView(options?: WebContentsViewConstructorOptions) {
    this.lastActiveAt = Date.now();

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

  /**
   * Takes the view away and leaves the account standing: the poll, the feed
   * baseline and the seen ids all survive, which is what lets a hibernated
   * account go on notifying with no page of its own. Everything here is also
   * what `destroy()` does to the view, so the two cannot drift.
   */
  destroyView() {
    const view = this._view;

    if (!view) {
      return;
    }

    removeWebContentsListeners(view.webContents);

    view.webContents.close();

    view.removeAllListeners();

    main.window.contentView.removeChildView(view);

    this._view = undefined;

    // Both describe a page that is no longer there: the title would leave the
    // tab wearing a stale unread count, and the fullscreen flag would lay the
    // next view out over the whole window.
    this.pageTitle = "";

    this.htmlFullscreen = false;
  }

  destroy() {
    this.destroyView();

    clearInterval(this.inboxFeedPollInterval);

    for (const unsubscribe of this.storeUnsubscribers) {
      unsubscribe();
    }

    this.storeUnsubscribers = [];
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

  /**
   * The inbox type is a property of the page, and hibernation takes the page
   * away, so the last one a live view reported is kept with the account for
   * the fetches that have nowhere to read it from.
   */
  private persistInboxType(inboxType: string) {
    const accountConfigs = config.get("accounts");

    const accountConfig = accountConfigs.find(({ id }) => id === this.accountId);

    if (!accountConfig || accountConfig.gmail.inboxType === inboxType) {
      return;
    }

    config.set(
      "accounts",
      accountConfigs.map((account) =>
        account.id === this.accountId
          ? { ...account, gmail: { ...account.gmail, inboxType } }
          : account,
      ),
    );
  }

  /**
   * Whether the response is a feed at all. A session Gmail no longer accepts
   * is answered with the sign-in page rather than with an error, so a fetch
   * that resolved says nothing on its own. This is the sign-in detection the
   * live view gets from the navigation it is sent on, for an account that has
   * no view to navigate.
   */
  private acceptInboxFeedResponse(res: Response) {
    if (res.ok && !res.url.startsWith(GOOGLE_ACCOUNTS_URL)) {
      // Only what this raised is cleared here, so a view sitting on a page
      // outside Gmail keeps the flag its own navigation set.
      if (this.inboxFeedRefused) {
        this.inboxFeedRefused = false;

        this.store.setState({ attentionRequired: false });
      }

      return true;
    }

    // Once per transition: an account left signed out would otherwise write
    // this every thirty seconds for as long as the app runs.
    if (!this.inboxFeedRefused) {
      this.inboxFeedRefused = true;

      log.error("Inbox feed refused", {
        accountId: this.accountId,
        status: res.status,
        url: res.url,
      });
    }

    this.store.setState({ attentionRequired: true });

    return false;
  }

  async fetchInboxFeed(
    { retryWhileUnchanged = true }: { retryWhileUnchanged?: boolean } = {},
    fetchAttempt = 1,
  ) {
    try {
      const view = this._view;

      // With a view the feed supplements Gmail's own push channel; without one
      // it is the account's only source of mail, which is what hibernation
      // runs on. With neither there is nothing to keep up to date.
      if (!view && !this.isHibernated) {
        return;
      }

      let inboxType: string | null;

      if (view) {
        if (!view.webContents.getURL().startsWith(GMAIL_URL)) {
          if (!this.inboxFeedBaseline) {
            await this.retryInboxFeedFetch(fetchAttempt, { retryWhileUnchanged });
          }

          return;
        }

        const inboxTypeValue = await view.webContents.executeJavaScript("window.GM_INBOX_TYPE");

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

        inboxType = inboxTypeSchema.parse(inboxTypeValue);

        this.persistInboxType(inboxType);
      } else {
        inboxType = accounts.getAccountConfig(this.accountId)?.gmail.inboxType ?? null;
      }

      const feedUrl = resolveInboxFeedUrl(inboxType, config.get("gmail.inboxCategoriesToMonitor"));

      // Taken before the fetch so the anchor is never later than the feed state
      // it describes.
      const readAt = Date.now();

      const res = await this.session.fetch(`${feedUrl}?t=${Date.now()}`);

      if (!this.acceptInboxFeedResponse(res)) {
        return;
      }

      const { feed } = inboxFeedSchema.parse(xmlParser.parse(await res.text()));

      // The preload's DOM observer is the authority on the count wherever
      // there is a page to run it, and it reads the inbox the user is looking
      // at. With no page, the feed's own count is what there is.
      if (!view) {
        this.setUnreadCount(feed.fullcount);
      }

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
      //
      // A hibernated account sends its list whether or not it is in the
      // unified inbox: that same renderer cache is where its own inbox is read
      // from, there being no Gmail page to show it one.
      if (
        licenseKey.isValid &&
        ((config.get("unifiedInbox.enabled") && this.unifiedInboxEnabled) || this.isHibernated)
      ) {
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
            main.show();

            accounts.selectAccount(this.accountId);

            this.openMessage(newMail.id);
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
      // A hibernated account has no page to run the action in, so main sends
      // Gmail the request the preload would have sent from inside one.
      if (!this.isHibernated || !(await this.sendMessageAction(messageId, action))) {
        return;
      }

      await this.fetchInboxFeed();

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

  /** The mutate endpoint's per-session key, inlined in Gmail's own HTML. */
  private async fetchGmailIdKey() {
    const res = await this.session.fetch(GMAIL_URL);

    this.gmailIdKey = parseGmailIdKey(await res.text());

    if (!this.gmailIdKey) {
      log.error("Gmail ID key is missing", { accountId: this.accountId });
    }

    return this.gmailIdKey;
  }

  /**
   * A row action for an account whose Gmail is hibernated: the request
   * `@meru/preload-gmail` sends from inside the page, sent from here over the
   * account's own session instead. A delegated account is no different, since
   * the preload posts to `GMAIL_URL` whichever account its page is showing.
   */
  private async sendMessageAction(messageId: string, action: GmailAction) {
    const [actionTokenCookie] = await this.session.cookies.get({
      url: GMAIL_URL,
      name: "GMAIL_AT",
    });

    if (!actionTokenCookie) {
      log.error("Gmail action token is missing", { accountId: this.accountId });

      return false;
    }

    const post = async (idKey: string) => {
      const { url, body } = createGmailMessageActionRequest({
        messageId,
        action,
        idKey,
        actionToken: actionTokenCookie.value,
      });

      const res = await this.session.fetch(url, {
        method: "POST",
        body,
        // Gmail refuses the endpoint without them. The preload has them for
        // free, posting from the page they name.
        headers: {
          Origin: this.baseUrl,
          Referer: `${GMAIL_URL}/`,
        },
      });

      await res.text();

      return res;
    };

    let idKey = this.gmailIdKey ?? (await this.fetchGmailIdKey());

    if (!idKey) {
      return false;
    }

    let res = await post(idKey);

    // The key belongs to a Gmail session rather than to the account, so a
    // cached one goes stale on its own and the refusal is the only word of it.
    if (!res.ok) {
      idKey = await this.fetchGmailIdKey();

      if (!idKey) {
        return false;
      }

      res = await post(idKey);
    }

    if (!res.ok) {
      log.error("Gmail message action failed", {
        accountId: this.accountId,
        action,
        status: res.status,
      });

      return false;
    }

    return true;
  }

  /**
   * The view an action that only means anything inside Gmail needs, waking a
   * hibernated account for it rather than doing nothing. `null` is an account
   * with no view and no reason to build one.
   */
  async wakeViewForAction() {
    if (!this._view && this.isHibernated) {
      await accounts.wakeGmail(this.accountId);
    }

    return this.viewOrNull;
  }

  async navigateTo(hashLocation: GmailHashLocation) {
    const view = await this.wakeViewForAction();

    if (!view || view.webContents.isDestroyed()) {
      return;
    }

    ipc.renderer.send(view.webContents, "gmail.navigateTo", hashLocation);
  }

  async openMessage(messageId: string) {
    const view = await this.wakeViewForAction();

    if (!view || view.webContents.isDestroyed()) {
      return;
    }

    ipc.renderer.send(view.webContents, "gmail.openMessage", messageId);
  }

  /**
   * Both halves are needed after a gap: the feed is what notices the mail, the
   * refresh is what makes the stale view show it.
   */
  resyncInbox() {
    if (!this._view && !this.isHibernated) {
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

  async search(query: string) {
    const view = await this.wakeViewForAction();

    view?.webContents.executeJavaScript(`window.location.hash = "#search/${query}"`);
  }

  async navigateToHash(urlOrHash: string) {
    const hash = urlOrHash.startsWith("https://") ? new URL(urlOrHash).hash : urlOrHash;

    if (!hash) {
      return;
    }

    const view = await this.wakeViewForAction();

    view?.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(hash)}`);
  }
}
