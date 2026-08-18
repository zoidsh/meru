import { randomUUID } from "node:crypto";
import { platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT, GOOGLE_ACCOUNTS_URL } from "@meru/shared/constants";
import { ONEPASSWORD_EXTENSION_ID } from "@meru/shared/extensions";
import { getWorkspaceAppFromUrl, getWorkspaceAppUrl } from "@meru/shared/google";
import type { AccountConfig } from "@meru/shared/schemas";
import { clamp } from "@meru/shared/utils";
import {
  type SupportedWorkspaceApp,
  type WorkspaceAppBookmarkState,
  type WorkspaceAppOpenBehavior,
  workspaceApps,
} from "@meru/shared/workspace-apps";
import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  clipboard,
  dialog,
  globalShortcut,
  powerSaveBlocker,
  type RestoreOptions,
  type Session,
  type WebContents,
  type WebContentsView,
  type WebContentsViewConstructorOptions,
} from "electron";
import { accounts } from "./accounts";
import { bookmarks } from "./bookmarks";
import { config } from "./config";
import { extensions } from "./extensions";
import { ipc } from "./ipc";
import { loadUrl, restoreNavigationHistory } from "./lib/load-url";
import {
  createChildWebContentsView,
  openViewDevToolsOnLaunch,
  removeWebContentsListeners,
} from "./lib/web-contents";
import {
  createBrowserWindow,
  getCascadedWindowBounds,
  getCommonBrowserWindowOptions,
  getPreloadPath,
  loadRenderer,
} from "./lib/window";
import { licenseKey } from "./license-key";
import { main } from "./main";
import { isWindowedTab, registerTabBroadcasts } from "./tabs";
import { openExternalUrl } from "./url";

export const MIN_ZOOM_FACTOR = 0.1;
export const MAX_ZOOM_FACTOR = 3;

const GOOGLE_MEET_TOGGLE_MICROPHONE_ACCELERATOR = "CommandOrControl+Shift+1";

const GOOGLE_MEET_TOGGLE_CAMERA_ACCELERATOR = "CommandOrControl+Shift+2";

const GOOGLE_CHAT_ATTACHMENT_URL_REGEXP = /chat\.google\.com\/u\/\d\/api\/get_attachment_url/;

const GOOGLE_PDF_VIEWER_URL_REGEXP = /googleusercontent\.com\/viewer\/secure\/pdf/;

/**
 * Whether an app may open inside Meru at all. `Open in App` and its exclusions
 * govern every way one opens — links, launcher, restoring a saved tab — so this
 * is the single place that answers it. An unrecognised URL only has the switch
 * to go on.
 */
export function canOpenWorkspaceAppInApp(app: SupportedWorkspaceApp | undefined) {
  if (!config.get("workspaceApps.openInApp")) {
    return false;
  }

  return !app || !config.get("workspaceApps.openInAppExcludedApps").includes(app);
}

export function resolveWorkspaceAppOpenBehavior(
  requestedOpenBehavior?: WorkspaceAppOpenBehavior,
): WorkspaceAppOpenBehavior {
  if (config.get("workspaceApps.mode") === "windows") {
    return "newWindow";
  }

  return requestedOpenBehavior ?? "tab";
}

type WorkspaceAppOptions = {
  accountId: AccountConfig["id"];
  url: string;
  window?: BrowserWindowConstructorOptions;
  view?: WebContentsViewConstructorOptions;
  asWindow?: boolean;
  savedAsWindow?: boolean;
  pinned?: boolean;
  loadOnLaunch?: boolean;
  hibernatesWhenIdle?: boolean;
  opensLinksForApp?: SupportedWorkspaceApp | null;
  app?: SupportedWorkspaceApp;
  zoomFactor?: number;
  navigationHistory?: RestoreOptions;
};

export class WorkspaceApp {
  private static instances = new Map<string, WorkspaceApp>();

  static fromId(workspaceAppId: string) {
    const instance = WorkspaceApp.instances.get(workspaceAppId);

    if (!instance) {
      throw new Error(`No WorkspaceApp instance for id ${workspaceAppId}`);
    }

    return instance;
  }

  static tryFromWebContents(webContents: WebContents) {
    for (const instance of WorkspaceApp.instances.values()) {
      if (instance._window?.webContents.id === webContents.id) {
        return instance;
      }
    }
  }

  static tryFromViewWebContents(webContents: WebContents) {
    for (const instance of WorkspaceApp.instances.values()) {
      if (instance.view.webContents.id === webContents.id) {
        return instance;
      }
    }
  }

  static applyPersistedZoomFactors() {
    for (const instance of WorkspaceApp.instances.values()) {
      instance.applyPersistedZoomFactor();
    }
  }

  static broadcastBookmarkStates() {
    for (const instance of WorkspaceApp.instances.values()) {
      instance.broadcastBookmarkState();
    }
  }

  static getAllWindows() {
    return Array.from(WorkspaceApp.instances.values())
      .filter((instance) => instance._window)
      .map((instance) => instance.window);
  }

  static getAccountWindowedInstances(accountId: AccountConfig["id"]) {
    return Array.from(WorkspaceApp.instances.values()).filter(
      (instance) => instance.accountId === accountId && instance._window,
    );
  }

  static closeAccountInstances(accountId: AccountConfig["id"]) {
    for (const instance of Array.from(WorkspaceApp.instances.values())) {
      if (instance.accountId === accountId) {
        instance.close();
      }
    }
  }

  static async handleNavigate(url: string, session: Session) {
    if (!url.startsWith(`${GOOGLE_ACCOUNTS_URL}/v3/signin/challenge/pk/presend`)) {
      return;
    }

    // Windows handles Google's platform passkeys natively via webauthn.dll.
    if (platform.isWindows) {
      return;
    }

    if (config.get("workspaceApps.hidePasskeyDialog")) {
      return;
    }

    // 1Password overrides `navigator.credentials` in the page, which is what lets
    // a passkey sign-in go through in Electron and makes the passkey dialog moot.
    if (extensions.isExtensionLoaded(session, ONEPASSWORD_EXTENSION_ID)) {
      return;
    }

    // The team id is only inlined into signed builds, which are the only ones
    // where Touch ID passkeys are configured (see `init` in index.ts).
    const touchIdAvailable = platform.isMacOS && Boolean(process.env.APPLE_TEAM_ID);

    const { checkboxChecked } = await dialog.showMessageBox({
      type: "info",
      message: touchIdAvailable
        ? "Only passkeys created in Meru work here"
        : "Passkey sign-in isn't supported on this platform yet",
      detail: touchIdAvailable
        ? "Continue with Touch ID if you've created a passkey in Meru. Passkeys from Chrome, iCloud or your phone can't be used here — sign in with your password or another second factor, then create a passkey for Meru in your Google account's security settings."
        : "Sign in with your password or another available second factor. If the account has no password, add one at myaccount.google.com in a browser first, then sign in here.",
      checkboxLabel: "Don't show again",
    });

    if (checkboxChecked) {
      config.set("workspaceApps.hidePasskeyDialog", true);
    }
  }

  static handleRedirect(event: Electron.Event, url: string, webContents: WebContents) {
    if (
      !url.startsWith("https://www.google.com") &&
      !url.startsWith("https://workspace.google.com")
    ) {
      return;
    }

    event.preventDefault();

    loadUrl(webContents, `${GOOGLE_ACCOUNTS_URL}/ServiceLogin?service=mail`);
  }

  static handleWindowOpen({
    accountId,
    details,
    webContents,
  }: {
    accountId: AccountConfig["id"];
    details: Pick<Electron.HandlerDetails, "url" | "disposition">;
    webContents: WebContents;
  }): ReturnType<Parameters<WebContents["setWindowOpenHandler"]>[0]> {
    const { url, disposition } = details;

    if (url === "about:blank") {
      return {
        action: "allow",
        createWindow: (options) => {
          let newWindow: BrowserWindow | null = new BrowserWindow({
            ...options,
            show: false,
          });

          newWindow.webContents.once("will-navigate", (_event, navigationUrl) => {
            if (!newWindow) {
              return;
            }

            if (navigationUrl.startsWith(GOOGLE_ACCOUNTS_URL)) {
              newWindow.show();

              return;
            }

            openExternalUrl(navigationUrl);

            newWindow.webContents.close();

            newWindow = null;
          });

          return newWindow.webContents;
        },
      };
    }

    if (url.startsWith(`${GOOGLE_ACCOUNTS_URL}/AddSession`)) {
      main.navigate("/settings/accounts");

      return { action: "deny" };
    }

    if (url.startsWith(GOOGLE_ACCOUNTS_URL)) {
      return { action: "allow" };
    }

    if (GOOGLE_PDF_VIEWER_URL_REGEXP.test(url) && disposition !== "background-tab") {
      new WorkspaceApp({ accountId, url, asWindow: true });

      return { action: "deny" };
    }

    const matchedSupportedWorkspaceApp = getWorkspaceAppFromUrl(url);

    if (
      matchedSupportedWorkspaceApp &&
      workspaceApps[matchedSupportedWorkspaceApp].singleInstance &&
      url.startsWith(getWorkspaceAppUrl(matchedSupportedWorkspaceApp)) &&
      disposition !== "background-tab"
    ) {
      const account = accounts.getAccount(accountId);

      account.instance.gmail.navigateToHash(url);

      accounts.selectAccount(accountId);

      main.show();

      return { action: "deny" };
    }

    const isWorkspaceAppEnabledToOpenInApp =
      licenseKey.isValid &&
      matchedSupportedWorkspaceApp &&
      !workspaceApps[matchedSupportedWorkspaceApp].singleInstance &&
      canOpenWorkspaceAppInApp(matchedSupportedWorkspaceApp);

    if (isWorkspaceAppEnabledToOpenInApp) {
      const requestedOpenBehavior =
        disposition === "new-window"
          ? "newWindow"
          : disposition === "background-tab"
            ? "backgroundTab"
            : undefined;

      const account = accounts.getAccount(accountId);

      // A tab designated for this app takes the link, unless the modifier keys
      // asked for a window or a background tab of its own. A Chat attachment is
      // a download dressed as a Chat URL, so it must never land in the tab the
      // user is chatting in.
      if (!requestedOpenBehavior && !GOOGLE_CHAT_ATTACHMENT_URL_REGEXP.test(url)) {
        const appLinksTab = account.instance.tabs.openInAppLinksTab(url);

        if (appLinksTab) {
          // A designated tab living in its own window has already been focused,
          // and raising the main window over it would undo that.
          if (!isWindowedTab(appLinksTab)) {
            accounts.selectAccount(accountId);

            main.show();
          }

          return { action: "deny" };
        }
      }

      const openBehavior = resolveWorkspaceAppOpenBehavior(requestedOpenBehavior);

      if (openBehavior === "newWindow") {
        account.instance.tabs.openWindowedTab(url);

        return { action: "deny" };
      }

      const workspaceApp = account.instance.tabs.openTab(url);

      if (openBehavior === "tab") {
        account.instance.tabs.activateTab(workspaceApp.id);

        accounts.selectAccount(accountId);

        main.show();
      }

      return { action: "deny" };
    }

    if (GOOGLE_CHAT_ATTACHMENT_URL_REGEXP.test(url)) {
      webContents.downloadURL(url);

      return { action: "deny" };
    }

    openExternalUrl(url, {
      skipTrustedHostCheck: Boolean(matchedSupportedWorkspaceApp),
      focusBrowser: disposition !== "background-tab",
    });

    return { action: "deny" };
  }

  private static getMeetInstances() {
    return Array.from(WorkspaceApp.instances.values()).filter(
      (instance) => instance.app === "meet",
    );
  }

  private static getMostRecentMeetInstance() {
    return WorkspaceApp.getMeetInstances().at(-1);
  }

  private static registerMeetShortcuts() {
    globalShortcut.register(GOOGLE_MEET_TOGGLE_MICROPHONE_ACCELERATOR, () => {
      const meetInstance = WorkspaceApp.getMostRecentMeetInstance();

      if (meetInstance) {
        ipc.renderer.send(meetInstance.view.webContents, "googleMeet.toggleMicrophone");
      }
    });

    globalShortcut.register(GOOGLE_MEET_TOGGLE_CAMERA_ACCELERATOR, () => {
      const meetInstance = WorkspaceApp.getMostRecentMeetInstance();

      if (meetInstance) {
        ipc.renderer.send(meetInstance.view.webContents, "googleMeet.toggleCamera");
      }
    });
  }

  private static unregisterMeetShortcuts() {
    globalShortcut.unregister(GOOGLE_MEET_TOGGLE_MICROPHONE_ACCELERATOR);
    globalShortcut.unregister(GOOGLE_MEET_TOGGLE_CAMERA_ACCELERATOR);
  }

  static resolveTitle(pageTitle: string, app: SupportedWorkspaceApp | undefined) {
    if (!app) {
      return pageTitle;
    }

    const appLabel = workspaceApps[app].label;

    if (!pageTitle) {
      return appLabel;
    }

    return pageTitle.replace(`Google ${appLabel}`, appLabel);
  }

  accountId: AccountConfig["id"];

  app: SupportedWorkspaceApp | undefined;

  id = randomUUID();

  private _window: BrowserWindow | undefined;

  get window() {
    if (!this._window) {
      throw new Error(`Workspace app ${this.id} has no window`);
    }

    return this._window;
  }

  get isWindowed() {
    return Boolean(this._window);
  }

  get isPopup() {
    return !this.account.instance.tabs.getTab(this.id);
  }

  get isSavable() {
    return !this.isPopup && Boolean(this.app);
  }

  get bookmarkState(): WorkspaceAppBookmarkState {
    return {
      savable: this.isSavable,
      bookmarked: bookmarks.isBookmarked(this.accountId, this.url),
    };
  }

  toggleBookmark() {
    if (!this.app) {
      return;
    }

    bookmarks.toggle(this.accountId, {
      app: this.app,
      url: this.url,
      title: this.title,
    });
  }

  private get chromeWebContents() {
    return this._window ? this._window.webContents : main.window.webContents;
  }

  view: WebContentsView;

  pinned: boolean;

  dormant = false;

  loadOnLaunch = false;

  hibernatesWhenIdle = false;

  /**
   * When this tab was last the account's active one. The sweep keeps it on the
   * clock for as long as it stays active, so the idle time it measures starts
   * the moment another tab takes over.
   */
  lastActiveAt = Date.now();

  opensLinksForApp: SupportedWorkspaceApp | null = null;

  /**
   * Whether this app should be restored in its own window, as opposed to
   * whether it currently has one. The two only differ in `windows` mode, where
   * every app is windowed because the mode says so rather than because the user
   * asked — persisting `isWindowed` there would rewrite the user's choice.
   */
  opensAsWindow: boolean;

  private powerSaveBlockerId: number | undefined;

  private viewDestroyed = false;

  private isClosing = false;

  private htmlFullscreen = false;

  constructor({
    accountId,
    url,
    window,
    view,
    asWindow,
    savedAsWindow,
    pinned,
    loadOnLaunch,
    hibernatesWhenIdle,
    opensLinksForApp,
    app,
    zoomFactor,
    navigationHistory,
  }: WorkspaceAppOptions) {
    this.accountId = accountId;
    this.app = app ?? getWorkspaceAppFromUrl(url);
    this.pinned = Boolean(pinned);
    this.loadOnLaunch = Boolean(loadOnLaunch);
    this.hibernatesWhenIdle = Boolean(hibernatesWhenIdle);
    this.opensLinksForApp = opensLinksForApp ?? null;
    this.opensAsWindow =
      savedAsWindow ?? (Boolean(asWindow) && config.get("workspaceApps.mode") !== "windows");

    if (asWindow) {
      this._window = this.createBrowserWindow(window);
    }

    this.view = this.createView({ url, options: view, navigationHistory });

    this.updateViewBounds();
    this.registerViewListeners();

    this.view.webContents.once("did-navigate", () => {
      this.applyInitialZoomFactor(zoomFactor);
    });

    this.view.webContents.once("destroyed", () => {
      this.viewDestroyed = true;

      if (this._window) {
        if (!this._window.isDestroyed()) {
          this._window.close();
        }

        return;
      }

      this.close();
    });

    WorkspaceApp.instances.set(this.id, this);

    if (this._window) {
      this.registerWindowListeners();
    } else {
      if (main.location !== "/") {
        this.view.setVisible(false);
      }
    }

    this.setupApp();
  }

  private createBrowserWindow(options?: BrowserWindowConstructorOptions) {
    const width = options?.width ?? 1280;
    const height = options?.height ?? 800;

    const browserWindow = createBrowserWindow({
      ...getCascadedWindowBounds({ width, height }),
      ...getCommonBrowserWindowOptions(),
      ...options,
    });

    const searchParams = new URLSearchParams();

    searchParams.set("accountId", this.accountId);

    searchParams.set("workspaceAppId", this.id);

    if (this.app) {
      searchParams.set("workspaceApp", this.app);
    }

    loadRenderer(browserWindow, {
      page: "workspace-app",
      searchParams,
    });

    return browserWindow;
  }

  private createView({
    url,
    options,
    navigationHistory,
  }: {
    url: string;
    options?: WebContentsViewConstructorOptions;
    navigationHistory?: RestoreOptions;
  }) {
    const view = createChildWebContentsView({
      session: this.account.instance.session,
      preload: getPreloadPath("workspace-app"),
      viewOptions: {
        ...options,
        webPreferences: {
          ...options?.webPreferences,
          // Docs cuts, copies and pastes from its Edit menu through
          // `document.execCommand`, which Electron gates behind this preference
          enableDeprecatedPaste: true,
        },
      },
      attachView: (createdView) => {
        if (this._window) {
          this._window.contentView.addChildView(createdView);
        } else {
          main.window.contentView.addChildView(createdView, 0);
        }
      },
      getFindInPageTargetWebContents: () => this.chromeWebContents,
      registerWindowOpenHandler: (createdView) => {
        this.setWindowOpenHandler(createdView);
      },
    });

    if (navigationHistory) {
      restoreNavigationHistory(view.webContents, navigationHistory);
    } else {
      loadUrl(view.webContents, url);
    }

    openViewDevToolsOnLaunch(view);

    return view;
  }

  private setWindowOpenHandler(view: WebContentsView) {
    view.webContents.setWindowOpenHandler((details) =>
      WorkspaceApp.handleWindowOpen({
        accountId: this.accountId,
        details,
        webContents: view.webContents,
      }),
    );
  }

  close() {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;

    this.teardown();

    if (this._window && !this._window.isDestroyed()) {
      this._window.destroy();
    }

    this.account.instance.tabs.removeTab(this.id);
  }

  private teardown() {
    if (!this.viewDestroyed) {
      removeWebContentsListeners(this.view.webContents);

      this.view.webContents.close();
    }

    if (!this._window && !main.window.isDestroyed()) {
      main.window.contentView.removeChildView(this.view);
    }

    this.teardownApp();

    WorkspaceApp.instances.delete(this.id);
  }

  private handleClose = () => {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;

    this.account.instance.tabs.handleWindowedTabClosed(this);

    this.teardown();
  };

  private setupApp() {
    if (this.app === "meet") {
      this.powerSaveBlockerId = powerSaveBlocker.start("prevent-display-sleep");

      if (WorkspaceApp.getMeetInstances().length === 1) {
        WorkspaceApp.registerMeetShortcuts();
      }
    }
  }

  private teardownApp() {
    if (this.app === "meet") {
      if (typeof this.powerSaveBlockerId === "number") {
        powerSaveBlocker.stop(this.powerSaveBlockerId);
      }

      if (WorkspaceApp.getMeetInstances().length === 1) {
        WorkspaceApp.unregisterMeetShortcuts();
      }
    }
  }

  private registerViewListeners() {
    this.view.webContents.on("did-navigate", this.handleDidNavigate);
    this.view.webContents.on("will-redirect", this.handleGoogleRedirect);
    this.view.webContents.on("page-title-updated", this.handlePageTitleUpdated);
    this.view.webContents.on("enter-html-full-screen", this.handleEnterHtmlFullscreen);
    this.view.webContents.on("leave-html-full-screen", this.handleLeaveHtmlFullscreen);

    if (this._window) {
      this.registerWindowedViewListeners();
    } else {
      registerTabBroadcasts(this.view);
    }
  }

  private registerWindowedViewListeners() {
    this.view.webContents.on("did-navigate", this.handleWindowedNavigation);
    this.view.webContents.on("did-navigate-in-page", this.handleWindowedNavigation);
    this.view.webContents.on("did-start-loading", this.broadcastLoadingState);
    this.view.webContents.on("did-stop-loading", this.broadcastLoadingState);
  }

  private unregisterWindowedViewListeners() {
    this.view.webContents.off("did-navigate", this.handleWindowedNavigation);
    this.view.webContents.off("did-navigate-in-page", this.handleWindowedNavigation);
    this.view.webContents.off("did-start-loading", this.broadcastLoadingState);
    this.view.webContents.off("did-stop-loading", this.broadcastLoadingState);
  }

  private handleWindowedNavigation = () => {
    this.broadcastNavigationState();

    this.broadcastBookmarkState();
  };

  private registerWindowListeners() {
    this.window.on("resize", this.updateViewBounds);
    this.window.on("close", this.handleClose);
    this.window.on("focus", () => {
      WorkspaceApp.instances.delete(this.id);

      WorkspaceApp.instances.set(this.id, this);
    });
  }

  detachToWindow() {
    this.opensAsWindow = true;

    main.window.contentView.removeChildView(this.view);

    this._window = this.createBrowserWindow();

    this.window.contentView.addChildView(this.view);

    this.view.setVisible(true);

    this.registerWindowedViewListeners();
    this.registerWindowListeners();

    this.updateViewBounds();
    this.updateWindowTitle();

    this.window.webContents.once("did-finish-load", () => {
      this.broadcastNavigationState();

      this.broadcastLoadingState();

      ipc.renderer.send(this.chromeWebContents, "workspaceApp.pageTitleChanged", this.title);
    });

    this.account.instance.tabs.deactivateTab(this.id);

    if (this.pinned) {
      accounts.saveTabs();
    }
  }

  focusWindow() {
    this.window.show();

    this.view.webContents.focus();
  }

  adoptIntoTabs() {
    this.opensAsWindow = false;

    const discardedWindow = this.window;

    discardedWindow.off("resize", this.updateViewBounds);
    discardedWindow.off("close", this.handleClose);

    this.unregisterWindowedViewListeners();

    discardedWindow.contentView.removeChildView(this.view);

    this._window = undefined;

    discardedWindow.destroy();

    main.window.contentView.addChildView(this.view, 0);

    if (main.location !== "/") {
      this.view.setVisible(false);
    }

    if (this.isPopup) {
      registerTabBroadcasts(this.view);

      this.account.instance.tabs.adoptTab(this);
    } else {
      this.account.instance.tabs.activateTab(this.id);
    }

    accounts.selectAccount(this.accountId);

    main.show();

    this.updateViewBounds();

    if (this.pinned) {
      accounts.saveTabs();
    }
  }

  private updateAppFromNavigation(url: string) {
    const navigatedApp = getWorkspaceAppFromUrl(url);

    if (navigatedApp === this.app) {
      return;
    }

    this.teardownApp();

    this.app = navigatedApp;

    this.setupApp();
  }

  private handleDidNavigate = (_event: Electron.Event, url: string) => {
    this.updateAppFromNavigation(url);

    WorkspaceApp.handleNavigate(url, this.account.instance.session);
  };

  private handleGoogleRedirect = (event: Electron.Event, url: string) => {
    WorkspaceApp.handleRedirect(event, url, this.view.webContents);
  };

  private handleEnterHtmlFullscreen = () => {
    this.htmlFullscreen = true;

    this.updateViewBounds();
  };

  private handleLeaveHtmlFullscreen = () => {
    this.htmlFullscreen = false;

    this.updateViewBounds();
  };

  get navigationHistory() {
    return {
      canGoBack: this.view.webContents.navigationHistory.canGoBack(),
      canGoForward: this.view.webContents.navigationHistory.canGoForward(),
    };
  }

  /**
   * The back-forward stack as Chromium hands it over, entry page state and all,
   * for a fresh view to be restored onto. It is what a tab takes with it into
   * hibernation, so waking it lands on the page it left, scrolled where it was.
   */
  get restorableNavigationHistory(): RestoreOptions {
    return {
      entries: this.view.webContents.navigationHistory.getAllEntries(),
      index: this.view.webContents.navigationHistory.getActiveIndex(),
    };
  }

  broadcastNavigationState = () => {
    ipc.renderer.send(
      this.chromeWebContents,
      "workspaceApp.navigationStateChanged",
      this.navigationHistory,
    );
  };

  private pageTitle = "";

  get title() {
    return WorkspaceApp.resolveTitle(this.pageTitle, this.app);
  }

  handlePageTitleUpdated = (_event: Electron.Event, pageTitle: string, explicitSet: boolean) => {
    this.pageTitle = explicitSet ? pageTitle : "";

    if (!this._window) {
      return;
    }

    ipc.renderer.send(this.chromeWebContents, "workspaceApp.pageTitleChanged", this.title);

    this.updateWindowTitle();
  };

  private updateWindowTitle() {
    if (!this.title) {
      this.window.setTitle(app.name);

      return;
    }

    const accountLabelPrefix =
      config.get("accounts").length > 1 ? `[${this.account.config.label}] ` : "";

    this.window.setTitle(`${accountLabelPrefix}${this.title} - ${app.name}`);
  }

  broadcastLoadingState = () => {
    ipc.renderer.send(
      this.chromeWebContents,
      "workspaceApp.loadingStateChanged",
      this.view.webContents.isLoading(),
    );
  };

  /**
   * Only a window has a bookmark button to keep in sync — an embedded tab is
   * bookmarked from its context menu, which is built fresh on every open.
   */
  broadcastBookmarkState = () => {
    if (!this._window || this.viewDestroyed) {
      return;
    }

    ipc.renderer.send(
      this.chromeWebContents,
      "workspaceApp.bookmarkStateChanged",
      this.bookmarkState,
    );
  };

  updateViewBounds = () => {
    const { width, height } = this._window
      ? this.window.getContentBounds()
      : main.getWindowBounds();

    if (this.htmlFullscreen) {
      this.view.setBounds({ x: 0, y: 0, width, height });

      return;
    }

    const verticalTabsWidth = this._window ? 0 : accounts.getVerticalTabsWidth();

    this.view.setBounds({
      x: verticalTabsWidth,
      y: APP_TITLEBAR_HEIGHT,
      width: width - verticalTabsWidth,
      height: height - APP_TITLEBAR_HEIGHT,
    });
  };

  goBack() {
    this.view.webContents.navigationHistory.goBack();
  }

  goForward() {
    this.view.webContents.navigationHistory.goForward();
  }

  navigate(url: string) {
    loadUrl(this.view.webContents, url);
  }

  reload() {
    this.view.webContents.reload();
  }

  hardReload() {
    this.view.webContents.reloadIgnoringCache();
  }

  zoomIn() {
    const zoomFactor = this.zoomFactor;

    if (zoomFactor === undefined) {
      return;
    }

    this.updateZoomFactor(zoomFactor + 0.1);
  }

  zoomOut() {
    const zoomFactor = this.zoomFactor;

    if (zoomFactor === undefined) {
      return;
    }

    this.updateZoomFactor(zoomFactor - 0.1);
  }

  resetZoom() {
    this.updateZoomFactor(1);
  }

  get zoomFactor() {
    if (this.viewDestroyed) {
      return undefined;
    }

    return this.view.webContents.getZoomFactor();
  }

  private get persistableZoomApp() {
    if (!config.get("workspaceApps.persistZoom") || !this.app || this.app === "gmail") {
      return undefined;
    }

    return this.app;
  }

  private updateZoomFactor(zoomFactor: number) {
    const clampedZoomFactor = clamp(zoomFactor, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);

    this.setZoomFactor(clampedZoomFactor);

    const persistableZoomApp = this.persistableZoomApp;

    if (!persistableZoomApp) {
      return;
    }

    const zoomFactors = { ...config.get("workspaceApps.zoomFactors") };

    if (clampedZoomFactor === 1) {
      delete zoomFactors[persistableZoomApp];
    } else {
      zoomFactors[persistableZoomApp] = clampedZoomFactor;
    }

    config.set("workspaceApps.zoomFactors", zoomFactors);
  }

  private applyInitialZoomFactor(dormantZoomFactor: number | undefined) {
    if (this.persistableZoomApp) {
      this.applyPersistedZoomFactor();

      return;
    }

    if (dormantZoomFactor !== undefined) {
      this.setZoomFactor(dormantZoomFactor);
    }
  }

  applyPersistedZoomFactor() {
    const persistableZoomApp = this.persistableZoomApp;

    if (!persistableZoomApp) {
      return;
    }

    this.setZoomFactor(config.get("workspaceApps.zoomFactors")[persistableZoomApp] ?? 1);
  }

  private setZoomFactor(zoomFactor: number) {
    if (this.viewDestroyed) {
      return;
    }

    this.view.webContents.setZoomFactor(clamp(zoomFactor, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR));
  }

  stop() {
    this.view.webContents.stop();
  }

  get isLoading() {
    return this.view.webContents.isLoading();
  }

  get isAudible() {
    return this.view.webContents.isCurrentlyAudible();
  }

  get url() {
    return this.view.webContents.getURL() || (this.app ? getWorkspaceAppUrl(this.app) : "");
  }

  copyUrl() {
    clipboard.writeText(this.view.webContents.getURL());
  }

  openInBrowser() {
    openExternalUrl(this.view.webContents.getURL(), { skipTrustedHostCheck: true });
  }

  get account() {
    return accounts.getAccount(this.accountId);
  }
}
