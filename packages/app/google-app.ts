import { APP_TITLEBAR_HEIGHT, GOOGLE_ACCOUNTS_URL } from "@meru/shared/constants";
import type { AccountConfig } from "@meru/shared/schemas";
import { supportedGoogleApps, type SupportedGoogleApp } from "@meru/shared/types";
import {
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
import { clamp } from "@meru/shared/utils";
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

const MIN_ZOOM_FACTOR = 0.1;
const MAX_ZOOM_FACTOR = 3;

const GOOGLE_CHAT_ATTACHMENT_URL_REGEXP = /chat\.google\.com\/u\/\d\/api\/get_attachment_url/;

const GOOGLE_PDF_VIEWER_URL_REGEXP = /googleusercontent\.com\/viewer\/secure\/pdf/;

const SUPPORTED_GOOGLE_APPS_URL_REGEXP = new RegExp(
  `(${Object.keys(supportedGoogleApps).join("|")})(?:\\.usercontent)?\\.google\\.com`,
);

function getGoogleAppFromUrl(url: string) {
  return url.match(SUPPORTED_GOOGLE_APPS_URL_REGEXP)?.[1] as SupportedGoogleApp | undefined;
}

type GoogleAppOptions = {
  accountId: AccountConfig["id"];
  url: string;
  browserWindow?: BrowserWindowConstructorOptions;
  view?: WebContentsViewConstructorOptions;
};

export class GoogleApp {
  private static instances = new Map<number, GoogleApp>();

  static fromWebContents(webContents: WebContents) {
    const instance = GoogleApp.instances.get(webContents.id);

    if (!instance) {
      throw new Error(`No GoogleApp instance for webContents ${webContents.id}`);
    }

    return instance;
  }

  static tryFromWebContents(webContents: WebContents) {
    return GoogleApp.instances.get(webContents.id);
  }

  static reuseWindowByHostname(accountId: AccountConfig["id"], url: string) {
    const urlHostname = new URL(url).hostname;

    for (const instance of GoogleApp.instances.values()) {
      const instanceWebContents = instance.view.webContents;

      if (!instanceWebContents) {
        continue;
      }

      if (
        instance.accountId === accountId &&
        new URL(instanceWebContents.getURL()).hostname === urlHostname
      ) {
        instanceWebContents.loadURL(url);

        instance.browserWindow.focus();

        return true;
      }
    }

    return false;
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

    if (url.startsWith(`${GOOGLE_ACCOUNTS_URL}/AddSession`)) {
      main.navigate("/settings/accounts");

      return { action: "deny" };
    }

    if (url.startsWith(GOOGLE_ACCOUNTS_URL)) {
      return { action: "allow" };
    }

    if (GOOGLE_PDF_VIEWER_URL_REGEXP.test(url) && disposition !== "background-tab") {
      new GoogleApp({ accountId, url });

      return { action: "deny" };
    }

    const matchedSupportedGoogleApp = getGoogleAppFromUrl(url);

    const isGoogleAppEnabledToOpenInApp =
      licenseKey.isValid &&
      matchedSupportedGoogleApp &&
      config.get("googleApps.openInApp") &&
      !config.get("googleApps.openInAppExcludedApps").includes(matchedSupportedGoogleApp);

    if (isGoogleAppEnabledToOpenInApp && disposition !== "background-tab") {
      if (
        !config.get("googleApps.openAppsInNewWindow") &&
        GoogleApp.reuseWindowByHostname(accountId, url)
      ) {
        return { action: "deny" };
      }

      new GoogleApp({
        accountId,
        url,
      });

      return { action: "deny" };
    }

    if (GOOGLE_CHAT_ATTACHMENT_URL_REGEXP.test(url)) {
      webContents.downloadURL(url);

      return { action: "deny" };
    }

    openExternalUrl(url, Boolean(matchedSupportedGoogleApp));

    return { action: "deny" };
  }

  accountId: AccountConfig["id"];

  app: SupportedGoogleApp | undefined;

  browserWindow: BrowserWindow;

  view: WebContentsView;

  private powerSaveBlockerId: number | undefined;

  constructor({ accountId, url, browserWindow, view }: GoogleAppOptions) {
    this.accountId = accountId;
    this.app = getGoogleAppFromUrl(url);

    this.browserWindow = this.createBrowserWindow(browserWindow);
    this.view = this.createView({ url, options: view });

    this.updateViewBounds();
    this.registerViewListeners();

    this.view.webContents?.once("destroyed", this.handleViewDestroyed);

    this.browserWindow.on("resize", this.updateViewBounds);
    this.browserWindow.on("close", this.handleClose);

    this.account.instance.windows.add(this.browserWindow);

    this.setupApp();

    GoogleApp.instances.set(this.browserWindow.webContents.id, this);
  }

  private createBrowserWindow(options?: BrowserWindowConstructorOptions) {
    const width = options?.width ?? 1280;
    const height = options?.height ?? 800;

    const browserWindow = createBrowserWindow({
      ...getCascadedWindowBounds({ width, height }),
      ...getCommonBrowserWindowOptions(),
      ...options,
    });

    loadRenderer(browserWindow, {
      renderer: "google-app",
      port: 3002,
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
        preload: getPreloadPath("google-app"),
      },
    });

    this.browserWindow.contentView.addChildView(view);

    setupWindowContextMenu(view);

    applyViewZoomLimits(view);

    broadcastFoundInPageResults(view, this.browserWindow.webContents);

    this.setWindowOpenHandler(view);

    view.webContents?.loadURL(url);

    openViewDevToolsInDev(view);

    return view;
  }

  private setWindowOpenHandler(view: WebContentsView) {
    const viewWebContents = view.webContents;

    if (!viewWebContents) {
      return;
    }

    viewWebContents.setWindowOpenHandler((details) =>
      GoogleApp.handleWindowOpen({
        accountId: this.accountId,
        details,
        webContents: viewWebContents,
      }),
    );
  }

  private handleClose = () => {
    this.unregisterViewListeners();

    this.teardownApp();

    this.account.instance.windows.delete(this.browserWindow);

    GoogleApp.instances.delete(this.browserWindow.webContents.id);
  };

  private handleViewDestroyed = () => {
    if (!this.browserWindow.isDestroyed()) {
      this.browserWindow.close();
    }
  };

  private setupApp() {
    if (this.app === "meet") {
      this.powerSaveBlockerId = powerSaveBlocker.start("prevent-display-sleep");

      globalShortcut.register("CommandOrControl+Shift+1", () => {
        const viewWebContents = this.view.webContents;

        if (viewWebContents) {
          ipc.renderer.send(viewWebContents, "googleMeet.toggleMicrophone");
        }
      });

      globalShortcut.register("CommandOrControl+Shift+2", () => {
        const viewWebContents = this.view.webContents;

        if (viewWebContents) {
          ipc.renderer.send(viewWebContents, "googleMeet.toggleCamera");
        }
      });
    }
  }

  private teardownApp() {
    if (this.app === "meet") {
      if (typeof this.powerSaveBlockerId === "number") {
        powerSaveBlocker.stop(this.powerSaveBlockerId);
      }

      globalShortcut.unregister("CommandOrControl+Shift+1");
      globalShortcut.unregister("CommandOrControl+Shift+2");
    }
  }

  private registerViewListeners() {
    const viewWebContents = this.view.webContents;

    if (!viewWebContents) {
      return;
    }

    viewWebContents.on("did-navigate", this.broadcastNavigationState);
    viewWebContents.on("did-navigate", this.handlePasskeyChallenge);
    viewWebContents.on("did-navigate-in-page", this.broadcastNavigationState);
    viewWebContents.on("page-title-updated", this.broadcastPageTitle);
    viewWebContents.on("did-start-loading", this.broadcastLoadingState);
    viewWebContents.on("did-stop-loading", this.broadcastLoadingState);
    viewWebContents.on("will-redirect", this.handleGoogleRedirect);
  }

  private unregisterViewListeners() {
    const viewWebContents = this.view.webContents;

    if (!viewWebContents || viewWebContents.isDestroyed()) {
      return;
    }

    viewWebContents.removeListener("did-navigate", this.broadcastNavigationState);
    viewWebContents.removeListener("did-navigate", this.handlePasskeyChallenge);
    viewWebContents.removeListener("did-navigate-in-page", this.broadcastNavigationState);
    viewWebContents.removeListener("page-title-updated", this.broadcastPageTitle);
    viewWebContents.removeListener("did-start-loading", this.broadcastLoadingState);
    viewWebContents.removeListener("did-stop-loading", this.broadcastLoadingState);
    viewWebContents.removeListener("will-redirect", this.handleGoogleRedirect);
  }

  private handlePasskeyChallenge = (_event: Electron.Event, url: string) => {
    GoogleApp.handleNavigate(url);
  };

  private handleGoogleRedirect = (event: Electron.Event, url: string) => {
    const viewWebContents = this.view.webContents;

    if (!viewWebContents) {
      return;
    }

    GoogleApp.handleRedirect(event, url, viewWebContents);
  };

  broadcastNavigationState = () => {
    const viewWebContents = this.view.webContents;

    if (!viewWebContents) {
      return;
    }

    ipc.renderer.send(this.browserWindow.webContents, "googleApp.navigationStateChanged", {
      canGoBack: viewWebContents.navigationHistory.canGoBack(),
      canGoForward: viewWebContents.navigationHistory.canGoForward(),
    });
  };

  broadcastPageTitle = () => {
    ipc.renderer.send(
      this.browserWindow.webContents,
      "googleApp.pageTitleChanged",
      this.view.webContents?.getTitle() ?? "",
    );
  };

  broadcastLoadingState = () => {
    ipc.renderer.send(
      this.browserWindow.webContents,
      "googleApp.loadingStateChanged",
      this.view.webContents?.isLoading() ?? false,
    );
  };

  updateViewBounds = () => {
    const { width, height } = this.browserWindow.getContentBounds();

    this.view.setBounds({
      x: 0,
      y: APP_TITLEBAR_HEIGHT,
      width,
      height: height - APP_TITLEBAR_HEIGHT,
    });
  };

  goBack() {
    this.view.webContents?.navigationHistory.goBack();
  }

  goForward() {
    this.view.webContents?.navigationHistory.goForward();
  }

  reload() {
    this.view.webContents?.reload();
  }

  hardReload() {
    this.view.webContents?.reloadIgnoringCache();
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
    return this.view.webContents?.getZoomFactor() ?? 1;
  }

  private setZoomFactor(zoomFactor: number) {
    this.view.webContents?.setZoomFactor(clamp(zoomFactor, MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR));
  }

  stop() {
    this.view.webContents?.stop();
  }

  get isLoading() {
    return this.view.webContents?.isLoading() ?? false;
  }

  copyUrl() {
    const url = this.view.webContents?.getURL();

    if (url) {
      clipboard.writeText(url);
    }
  }

  openInBrowser() {
    const url = this.view.webContents?.getURL();

    if (url) {
      openExternalUrl(url, true);
    }
  }

  get account() {
    return accounts.getAccount(this.accountId);
  }
}
