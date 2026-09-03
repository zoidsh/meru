import fs from "node:fs";
import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import {
  createGmailDelegatedAccountUrl,
  GMAIL_DELEGATED_ACCOUNT_URL_REGEXP,
  GMAIL_INBOX_FEED_URL,
  GMAIL_PRELOAD_ARGUMENTS,
  GMAIL_URL,
  type GmailInboxMessage,
  generateGmailLabelColorsCss,
  parseGmailMessageId,
} from "@meru/shared/gmail";
import { ms } from "@meru/shared/ms";
import { clamp, wait } from "@meru/shared/utils";
import type { SupportedWorkspaceApp } from "@meru/shared/workspace-apps";
import { extractVerificationCode } from "@meru/verification-code";
import {
  app,
  BrowserWindow,
  clipboard,
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

export class Gmail {
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
      unreadInbox: GmailInboxMessage[];
      outOfOffice: boolean;
      attentionRequired: boolean;
    }>(() => ({
      unreadCount: 0,
      unreadInbox: [],
      outOfOffice: false,
      attentionRequired: false,
    })),
  );

  private labelColorsCssKey: string | null = null;

  private isInitialInboxFeedFetch = true;

  private previousInboxFeedTotalEntries: number = 0;

  private previousNewMessages: Map<string, number> = new Map();

  private previousNewMessagesPruneInterval: NodeJS.Timeout;

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

    this.previousNewMessagesPruneInterval = setInterval(() => {
      for (const [messageId, timestamp] of this.previousNewMessages) {
        if (Date.now() - timestamp > ms("5m")) {
          this.previousNewMessages.delete(messageId);
        }
      }
    }, ms("5m"));
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

    clearInterval(this.previousNewMessagesPruneInterval);

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

  async fetchInboxFeed(fetchAttempt = 1) {
    try {
      if (!this.view.webContents.getURL().startsWith(GMAIL_URL)) {
        return;
      }

      const inboxTypeValue = await this.view.webContents.executeJavaScript("window.GM_INBOX_TYPE");

      // The URL is already Gmail's while the page is still loading, such as
      // during sign-in, so the global is missing rather than wrong. Treat that
      // as "not loaded yet" and return, the way the URL check above does.
      if (inboxTypeValue === undefined) {
        return;
      }

      const inboxType = inboxTypeSchema.parse(inboxTypeValue);

      const body = await this.session
        .fetch(
          `${GMAIL_INBOX_FEED_URL}${inboxType === "SECTIONED" && config.get("gmail.inboxCategoriesToMonitor") === "primary" ? "/^sq_ig_i_personal" : ""}?t=${Date.now()}`,
        )
        .then((res) => res.text());

      const { feed } = inboxFeedSchema.parse(xmlParser.parse(body));

      const feedEntries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];

      if (feedEntries.length === this.previousInboxFeedTotalEntries) {
        if (fetchAttempt > 10) {
          return;
        }

        await wait(ms("1s"));

        this.fetchInboxFeed(fetchAttempt + 1);

        return;
      }

      this.previousInboxFeedTotalEntries = feedEntries.length;

      const unreadInbox: GmailInboxMessage[] = [];
      const newMailIndexes: number[] = [];

      const now = Date.now();

      for (const [
        index,
        { id, link, title, summary, author, contributor, issued },
      ] of feedEntries.entries()) {
        const messageId = new URLSearchParams(link["@_href"]).get("message_id");
        const receivedAt = new Date(issued).getTime();

        if (!messageId) {
          throw new Error("Message ID not found in inbox feed entry");
        }

        unreadInbox.push({
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

        if (now - receivedAt < ms("1m") && !this.previousNewMessages.has(id)) {
          newMailIndexes.push(index);

          this.previousNewMessages.set(id, now);
        }
      }

      if (licenseKey.isValid && config.get("unifiedInbox.enabled") && this.unifiedInboxEnabled) {
        this.store.setState({ unreadInbox });
      }

      if (this.isInitialInboxFeedFetch) {
        this.isInitialInboxFeedFetch = false;

        return;
      }

      const account = accounts.getAccount(this.accountId);

      const hasMultipleAccounts = accounts.getAccountConfigs().length > 1;

      for (const newMailIndex of newMailIndexes.reverse()) {
        const newMail = unreadInbox[newMailIndex];

        if (!newMail) {
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
            const copyVerificationCode = () => {
              clipboard.writeText(verificationCode);

              if (config.get("verificationCodes.autoMarkAsRead")) {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.id,
                  "markAsRead",
                );
              }

              if (config.get("verificationCodes.autoDelete")) {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.id,
                  "delete",
                );
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

            createNotification({
              title: notificationTitle,
              body: copiesOnNotificationClick
                ? `Click to copy verification code ${verificationCode}`
                : `Copied verification code ${verificationCode}`,
              click: copiesOnNotificationClick ? copyVerificationCode : undefined,
            });

            continue;
          }
        }

        if (
          !config.get("notifications.enabled") ||
          !account.config.notifications ||
          config.get("doNotDisturb.enabled") ||
          !isWithinNotificationTimes()
        ) {
          continue;
        }

        createNewEmailNotification({
          title: notificationTitle,
          subtitle,
          body,
          actions: [
            {
              text: "Archive",
              type: "button",
            },
            {
              text: "Mark as Read",
              type: "button",
            },
            {
              text: "Delete",
              type: "button",
            },
            {
              text: "Mark as Spam",
              type: "button",
            },
          ],
          click: () => {
            main.show();

            accounts.selectAccount(this.accountId);

            ipc.renderer.send(this.view.webContents, "gmail.openMessage", newMail.id);
          },
          action: (index) => {
            switch (index) {
              case 0: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.id,
                  "archive",
                );

                break;
              }
              case 1: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.id,
                  "markAsRead",
                );

                break;
              }
              case 2: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.id,
                  "delete",
                );

                break;
              }
              case 3: {
                ipc.renderer.send(
                  this.view.webContents,
                  "gmail.handleMessage",
                  newMail.id,
                  "markAsSpam",
                );

                break;
              }
            }
          },
        });
      }
    } catch (error) {
      log.error("Failed to fetch inbox feed", { error });
    }
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

    if (licenseKey.isValid && config.get("unifiedInbox.enabled") && this.unifiedInboxEnabled) {
      this.storeUnsubscribers.push(
        this.store.subscribe(
          (state) => state.unreadInbox,
          () => {
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
}
