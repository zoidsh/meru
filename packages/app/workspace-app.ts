import { randomUUID } from "node:crypto";
import { APP_TITLEBAR_HEIGHT, GOOGLE_ACCOUNTS_URL } from "@meru/shared/constants";
import { getWorkspaceAppUrl } from "@meru/shared/google";
import type { AccountConfig } from "@meru/shared/schemas";
import { clamp } from "@meru/shared/utils";
import {
  type SupportedWorkspaceApp,
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
  type WebContents,
  WebContentsView,
  type WebContentsViewConstructorOptions,
} from "electron";
import { accounts } from "./accounts";
import { config } from "./config";
import { setupWindowContextMenu } from "./context-menu";
import { ipc } from "./ipc";
import {
  applyViewZoomLimits,
  broadcastFoundInPageResults,
  openViewDevToolsInDev,
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
import { appState } from "./state";
import { registerTabBroadcasts } from "./tabs";
import { openExternalUrl } from "./url";

export const MIN_ZOOM_FACTOR = 0.1;
export const MAX_ZOOM_FACTOR = 3;

const GOOGLE_MEET_TOGGLE_MICROPHONE_ACCELERATOR = "CommandOrControl+Shift+1";

const GOOGLE_MEET_TOGGLE_CAMERA_ACCELERATOR = "CommandOrControl+Shift+2";

const GOOGLE_CHAT_ATTACHMENT_URL_REGEXP = /chat\.google\.com\/u\/\d\/api\/get_attachment_url/;

const GOOGLE_PDF_VIEWER_URL_REGEXP = /googleusercontent\.com\/viewer\/secure\/pdf/;

const workspaceAppsBySubdomain = new Map<string, SupportedWorkspaceApp>(
  (Object.keys(workspaceApps) as SupportedWorkspaceApp[]).map((workspaceApp) => [
    new URL(getWorkspaceAppUrl(workspaceApp)).hostname.replace(".google.com", ""),
    workspaceApp,
  ]),
);

const SUPPORTED_WORKSPACE_APPS_URL_REGEXP = new RegExp(
  `(${Array.from(workspaceAppsBySubdomain.keys()).join("|")})(?:\\.usercontent)?\\.google\\.com`,
);

function getWorkspaceAppFromUrl(url: string) {
  const workspaceAppSubdomain = url.match(SUPPORTED_WORKSPACE_APPS_URL_REGEXP)?.[1];

  if (!workspaceAppSubdomain) {
    return undefined;
  }

  return workspaceAppsBySubdomain.get(workspaceAppSubdomain);
}

type WorkspaceAppOptions = {
  accountId: AccountConfig["id"];
  url: string;
  window?: BrowserWindowConstructorOptions;
  view?: WebContentsViewConstructorOptions;
  asWindow?: boolean;
  pinned?: boolean;
  loadOnLaunch?: boolean;
  app?: SupportedWorkspaceApp;
  zoomFactor?: number;
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

  static applyPersistedZoomFactors() {
    for (const instance of WorkspaceApp.instances.values()) {
      instance.applyPersistedZoomFactor();
    }
  }

  static getAllWindows() {
    return Array.from(WorkspaceApp.instances.values())
      .filter((instance) => instance._window)
      .map((instance) => instance.window);
  }

  static handleNavigate(url: string) {
    if (!url.startsWith(`${GOOGLE_ACCOUNTS_URL}/v3/signin/challenge/pk/presend`)) {
      return;
    }

    dialog.showMessageBox({
      type: "info",
      message: "Passkey sign-in not supported yet",
      detail: "Please use password to sign in.",
    });
  }

  static handleRedirect(event: Electron.Event, url: string, webContents: WebContents) {
    if (
      !url.startsWith("https://www.google.com") &&
      !url.startsWith("https://workspace.google.com")
    ) {
      return;
    }

    event.preventDefault();

    webContents.loadURL(`${GOOGLE_ACCOUNTS_URL}/ServiceLogin?service=mail`);
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
      config.get("workspaceApps.openInApp") &&
      !config.get("workspaceApps.openInAppExcludedApps").includes(matchedSupportedWorkspaceApp);

    if (isWorkspaceAppEnabledToOpenInApp) {
      if (workspaceApps[matchedSupportedWorkspaceApp].popupOnly) {
        new WorkspaceApp({ accountId, url, asWindow: true });

        return { action: "deny" };
      }

      const openBehavior: WorkspaceAppOpenBehavior =
        disposition === "new-window"
          ? "newWindow"
          : disposition === "background-tab"
            ? "backgroundTab"
            : config.get("workspaceApps.openBehavior");

      const account = accounts.getAccount(accountId);

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

  private get chromeWebContents() {
    return this._window ? this._window.webContents : main.window.webContents;
  }

  view: WebContentsView;

  pinned = false;

  loadOnLaunch = false;

  private powerSaveBlockerId: number | undefined;

  private viewDestroyed = false;

  private isClosing = false;

  constructor({
    accountId,
    url,
    window,
    view,
    asWindow,
    pinned,
    loadOnLaunch,
    app,
    zoomFactor,
  }: WorkspaceAppOptions) {
    this.accountId = accountId;
    this.app = app ?? getWorkspaceAppFromUrl(url);
    this.pinned = Boolean(pinned);
    this.loadOnLaunch = Boolean(loadOnLaunch);

    if (asWindow) {
      this._window = this.createBrowserWindow(window);
    }

    this.view = this.createView({ url, options: view });

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
      this.account.instance.windows.add(this.view);

      if (appState.isSettingsOpen) {
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
      renderer: "workspace-app",
      port: 3002,
      searchParams,
    });

    return browserWindow;
  }

  private createView({
    url,
    options,
  }: {
    url: string;
    options?: WebContentsViewConstructorOptions;
  }) {
    const view = new WebContentsView({
      ...options,
      webPreferences: {
        ...options?.webPreferences,
        session: this.account.instance.session,
        preload: getPreloadPath("workspace-app"),
      },
    });

    if (this._window) {
      this._window.contentView.addChildView(view);
    } else {
      main.window.contentView.addChildView(view, 0);
    }

    setupWindowContextMenu(view);

    applyViewZoomLimits(view);

    broadcastFoundInPageResults(view, () => this.chromeWebContents);

    this.setWindowOpenHandler(view);

    view.webContents.loadURL(url);

    openViewDevToolsInDev(view);

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
      this.view.webContents.removeAllListeners();

      this.view.webContents.close();
    }

    if (this._window) {
      this.account.instance.windows.delete(this._window);
    } else {
      if (!main.window.isDestroyed()) {
        main.window.contentView.removeChildView(this.view);
      }

      this.account.instance.windows.delete(this.view);
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
    this.view.webContents.on("did-navigate", this.handlePasskeyChallenge);
    this.view.webContents.on("will-redirect", this.handleGoogleRedirect);
    this.view.webContents.on("page-title-updated", this.handlePageTitleUpdated);

    if (this._window) {
      this.registerWindowedViewListeners();
    } else {
      registerTabBroadcasts(this.view);
    }
  }

  private registerWindowedViewListeners() {
    this.view.webContents.on("did-navigate", this.broadcastNavigationState);
    this.view.webContents.on("did-navigate-in-page", this.broadcastNavigationState);
    this.view.webContents.on("did-start-loading", this.broadcastLoadingState);
    this.view.webContents.on("did-stop-loading", this.broadcastLoadingState);
  }

  private unregisterWindowedViewListeners() {
    this.view.webContents.off("did-navigate", this.broadcastNavigationState);
    this.view.webContents.off("did-navigate-in-page", this.broadcastNavigationState);
    this.view.webContents.off("did-start-loading", this.broadcastLoadingState);
    this.view.webContents.off("did-stop-loading", this.broadcastLoadingState);
  }

  private registerWindowListeners() {
    this.window.on("resize", this.updateViewBounds);
    this.window.on("close", this.handleClose);
    this.window.on("focus", () => {
      WorkspaceApp.instances.delete(this.id);

      WorkspaceApp.instances.set(this.id, this);
    });

    this.account.instance.windows.add(this.window);
  }

  detachToWindow() {
    main.window.contentView.removeChildView(this.view);

    this.account.instance.windows.delete(this.view);

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
  }

  focusWindow() {
    this.window.show();

    this.view.webContents.focus();
  }

  adoptIntoTabs() {
    const discardedWindow = this.window;

    discardedWindow.off("resize", this.updateViewBounds);
    discardedWindow.off("close", this.handleClose);

    this.unregisterWindowedViewListeners();

    discardedWindow.contentView.removeChildView(this.view);

    this.account.instance.windows.delete(discardedWindow);

    this._window = undefined;

    discardedWindow.destroy();

    main.window.contentView.addChildView(this.view, 0);

    this.account.instance.windows.add(this.view);

    if (appState.isSettingsOpen) {
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
  }

  private handlePasskeyChallenge = (_event: Electron.Event, url: string) => {
    WorkspaceApp.handleNavigate(url);
  };

  private handleGoogleRedirect = (event: Electron.Event, url: string) => {
    WorkspaceApp.handleRedirect(event, url, this.view.webContents);
  };

  get navigationHistory() {
    return {
      canGoBack: this.view.webContents.navigationHistory.canGoBack(),
      canGoForward: this.view.webContents.navigationHistory.canGoForward(),
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

  updateViewBounds = () => {
    if (!this._window) {
      const { width, height } = main.getWindowBounds();

      const tabStripWidth = accounts.getTabStripWidth();

      this.view.setBounds({
        x: tabStripWidth,
        y: APP_TITLEBAR_HEIGHT,
        width: width - tabStripWidth,
        height: height - APP_TITLEBAR_HEIGHT,
      });

      return;
    }

    const { width, height } = this.window.getContentBounds();

    this.view.setBounds({
      x: 0,
      y: APP_TITLEBAR_HEIGHT,
      width,
      height: height - APP_TITLEBAR_HEIGHT,
    });
  };

  goBack() {
    this.view.webContents.navigationHistory.goBack();
  }

  goForward() {
    this.view.webContents.navigationHistory.goForward();
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
