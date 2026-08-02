import { APP_TITLEBAR_HEIGHT, GOOGLE_ACCOUNTS_URL } from "@meru/shared/constants";
import { GMAIL_URL } from "@meru/shared/gmail";
import type { AccountConfig } from "@meru/shared/schemas";
import { supportedWorkspaceApps, type SupportedWorkspaceApp } from "@meru/shared/types";
import { clamp } from "@meru/shared/utils";
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
import { openExternalUrl } from "./url";

export const MIN_ZOOM_FACTOR = 0.1;
export const MAX_ZOOM_FACTOR = 3;

const GOOGLE_MEET_TOGGLE_MICROPHONE_ACCELERATOR = "CommandOrControl+Shift+1";

const GOOGLE_MEET_TOGGLE_CAMERA_ACCELERATOR = "CommandOrControl+Shift+2";

const GOOGLE_CHAT_ATTACHMENT_URL_REGEXP = /chat\.google\.com\/u\/\d\/api\/get_attachment_url/;

const GOOGLE_PDF_VIEWER_URL_REGEXP = /googleusercontent\.com\/viewer\/secure\/pdf/;

const SUPPORTED_WORKSPACE_APPS_URL_REGEXP = new RegExp(
  `(${Object.keys(supportedWorkspaceApps).join("|")})(?:\\.usercontent)?\\.google\\.com`,
);

function getWorkspaceAppFromUrl(url: string) {
  return url.match(SUPPORTED_WORKSPACE_APPS_URL_REGEXP)?.[1] as SupportedWorkspaceApp | undefined;
}

type WorkspaceAppOptions = {
  accountId: AccountConfig["id"];
  url: string;
  window?: BrowserWindowConstructorOptions;
  view?: WebContentsViewConstructorOptions;
};

export class WorkspaceApp {
  private static instances = new Map<number, WorkspaceApp>();

  static fromWebContents(webContents: WebContents) {
    const instance = WorkspaceApp.instances.get(webContents.id);

    if (!instance) {
      throw new Error(`No WorkspaceApp instance for webContents ${webContents.id}`);
    }

    return instance;
  }

  static tryFromWebContents(webContents: WebContents) {
    return WorkspaceApp.instances.get(webContents.id);
  }

  static getAllWindows() {
    return Array.from(WorkspaceApp.instances.values(), (instance) => instance.window);
  }

  static reuseWindowByHostname(accountId: AccountConfig["id"], url: string) {
    const urlHostname = new URL(url).hostname;

    const reusableInstance = Array.from(WorkspaceApp.instances.values())
      .reverse()
      .find(
        (instance) =>
          instance.accountId === accountId &&
          new URL(instance.view.webContents.getURL()).hostname === urlHostname,
      );

    if (!reusableInstance) {
      return false;
    }

    reusableInstance.view.webContents.loadURL(url);

    reusableInstance.window.focus();

    return true;
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
    details: Electron.HandlerDetails;
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

    if (url.startsWith(GMAIL_URL) && disposition !== "background-tab") {
      const account = accounts.getAccount(accountId);

      account.instance.gmail.navigateToHash(url);

      accounts.selectAccount(accountId);

      main.show();

      return { action: "deny" };
    }

    if (url.startsWith(`${GOOGLE_ACCOUNTS_URL}/AddSession`)) {
      main.navigate("/settings/accounts");

      return { action: "deny" };
    }

    if (url.startsWith(GOOGLE_ACCOUNTS_URL)) {
      return { action: "allow" };
    }

    if (GOOGLE_PDF_VIEWER_URL_REGEXP.test(url) && disposition !== "background-tab") {
      new WorkspaceApp({ accountId, url });

      return { action: "deny" };
    }

    const matchedSupportedWorkspaceApp = getWorkspaceAppFromUrl(url);

    const isWorkspaceAppEnabledToOpenInApp =
      licenseKey.isValid &&
      matchedSupportedWorkspaceApp &&
      config.get("workspaceApps.openInApp") &&
      !config.get("workspaceApps.openInAppExcludedApps").includes(matchedSupportedWorkspaceApp);

    if (isWorkspaceAppEnabledToOpenInApp && disposition !== "background-tab") {
      if (
        !config.get("workspaceApps.openAppsInNewWindow") &&
        WorkspaceApp.reuseWindowByHostname(accountId, url)
      ) {
        return { action: "deny" };
      }

      new WorkspaceApp({
        accountId,
        url,
      });

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

  accountId: AccountConfig["id"];

  app: SupportedWorkspaceApp | undefined;

  window: BrowserWindow;

  view: WebContentsView;

  private powerSaveBlockerId: number | undefined;

  private viewDestroyed = false;

  constructor({ accountId, url, window, view }: WorkspaceAppOptions) {
    this.accountId = accountId;
    this.app = getWorkspaceAppFromUrl(url);

    this.window = this.createBrowserWindow(window);
    this.view = this.createView({ url, options: view });

    this.updateViewBounds();
    this.registerViewListeners();

    this.view.webContents.once("destroyed", () => {
      this.viewDestroyed = true;

      if (!this.window.isDestroyed()) {
        this.window.close();
      }
    });

    WorkspaceApp.instances.set(this.window.webContents.id, this);

    this.window.on("resize", this.updateViewBounds);
    this.window.on("close", this.handleClose);
    this.window.on("focus", () => {
      WorkspaceApp.instances.delete(this.window.webContents.id);

      WorkspaceApp.instances.set(this.window.webContents.id, this);
    });

    this.account.instance.windows.add(this.window);

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

    this.window.contentView.addChildView(view);

    setupWindowContextMenu(view);

    applyViewZoomLimits(view);

    broadcastFoundInPageResults(view, this.window.webContents);

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

  private handleClose = () => {
    if (!this.viewDestroyed) {
      this.unregisterViewListeners();

      this.view.webContents.close();
    }

    this.teardownApp();

    this.account.instance.windows.delete(this.window);

    WorkspaceApp.instances.delete(this.window.webContents.id);
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
    this.view.webContents.on("did-navigate", this.broadcastNavigationState);
    this.view.webContents.on("did-navigate", this.handlePasskeyChallenge);
    this.view.webContents.on("did-navigate-in-page", this.broadcastNavigationState);
    this.view.webContents.on("page-title-updated", this.handlePageTitleUpdated);
    this.view.webContents.on("did-start-loading", this.broadcastLoadingState);
    this.view.webContents.on("did-stop-loading", this.broadcastLoadingState);
    this.view.webContents.on("will-redirect", this.handleGoogleRedirect);
  }

  private unregisterViewListeners() {
    this.view.webContents.removeListener("did-navigate", this.broadcastNavigationState);
    this.view.webContents.removeListener("did-navigate", this.handlePasskeyChallenge);
    this.view.webContents.removeListener("did-navigate-in-page", this.broadcastNavigationState);
    this.view.webContents.removeListener("page-title-updated", this.handlePageTitleUpdated);
    this.view.webContents.removeListener("did-start-loading", this.broadcastLoadingState);
    this.view.webContents.removeListener("did-stop-loading", this.broadcastLoadingState);
    this.view.webContents.removeListener("will-redirect", this.handleGoogleRedirect);
  }

  private handlePasskeyChallenge = (_event: Electron.Event, url: string) => {
    WorkspaceApp.handleNavigate(url);
  };

  private handleGoogleRedirect = (event: Electron.Event, url: string) => {
    WorkspaceApp.handleRedirect(event, url, this.view.webContents);
  };

  broadcastNavigationState = () => {
    ipc.renderer.send(this.window.webContents, "workspaceApp.navigationStateChanged", {
      canGoBack: this.view.webContents.navigationHistory.canGoBack(),
      canGoForward: this.view.webContents.navigationHistory.canGoForward(),
    });
  };

  handlePageTitleUpdated = () => {
    const pageTitle = this.view.webContents.getTitle();

    ipc.renderer.send(this.window.webContents, "workspaceApp.pageTitleChanged", pageTitle);

    const title = pageTitle || (this.app ? supportedWorkspaceApps[this.app] : "");

    if (!title) {
      this.window.setTitle(app.name);

      return;
    }

    const accountLabelPrefix =
      config.get("accounts").length > 1 ? `[${this.account.config.label}] ` : "";

    this.window.setTitle(`${accountLabelPrefix}${title} - ${app.name}`);
  };

  broadcastLoadingState = () => {
    ipc.renderer.send(
      this.window.webContents,
      "workspaceApp.loadingStateChanged",
      this.view.webContents.isLoading(),
    );
  };

  updateViewBounds = () => {
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
    this.setZoomFactor(this.zoomFactor + 0.1);
  }

  zoomOut() {
    this.setZoomFactor(this.zoomFactor - 0.1);
  }

  resetZoom() {
    this.setZoomFactor(1);
  }

  private get zoomFactor() {
    return this.view.webContents.getZoomFactor();
  }

  private setZoomFactor(zoomFactor: number) {
    this.view.webContents.setZoomFactor(clamp(zoomFactor, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR));
  }

  stop() {
    this.view.webContents.stop();
  }

  get isLoading() {
    return this.view.webContents.isLoading();
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
