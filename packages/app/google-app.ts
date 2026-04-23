import { is } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT, GOOGLE_ACCOUNTS_URL } from "@meru/shared/constants";
import type { AccountConfig } from "@meru/shared/schemas";
import { supportedGoogleApps, type SupportedGoogleApp } from "@meru/shared/types";
import {
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  powerSaveBlocker,
  type WebContents,
  WebContentsView,
} from "electron";
import { accounts } from "./accounts";
import { config } from "./config";
import { setupWindowContextMenu } from "./context-menu";
import { ipc } from "./ipc";
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
      if (
        instance.accountId === accountId &&
        new URL(instance.view.webContents.getURL()).hostname === urlHostname
      ) {
        instance.view.webContents.loadURL(url);

        instance.browserWindow.focus();

        return true;
      }
    }

    return false;
  }

  accountId: AccountConfig["id"];

  app: SupportedGoogleApp;

  browserWindow: BrowserWindow;

  view: WebContentsView;

  private powerSaveBlockerId: number | undefined;

  constructor({ accountId, url }: GoogleAppOptions) {
    const app = getGoogleAppFromUrl(url);

    if (!app) {
      throw new Error(`Cannot determine Google app from URL: ${url}`);
    }

    this.accountId = accountId;
    this.app = app;

    this.browserWindow = this.createBrowserWindow();
    this.view = this.createView({ url });

    this.updateViewBounds();
    this.registerViewListeners();

    this.browserWindow.on("resize", this.updateViewBounds);
    this.browserWindow.on("close", this.handleClose);

    this.account.instance.windows.add(this.browserWindow);

    this.setupApp();

    GoogleApp.instances.set(this.browserWindow.webContents.id, this);
  }

  private createBrowserWindow() {
    const browserWindow = createBrowserWindow({
      ...getCascadedWindowBounds({ width: 1280, height: 800 }),
      ...getCommonBrowserWindowOptions(),
    });

    loadRenderer(browserWindow, {
      renderer: "google-app",
      port: 3002,
    });

    return browserWindow;
  }

  private createView({ url }: { url: string }) {
    const view = new WebContentsView({
      webPreferences: {
        session: this.account.instance.session,
        preload: getPreloadPath("google-app"),
      },
    });

    this.browserWindow.contentView.addChildView(view);

    setupWindowContextMenu(view);

    this.setWindowOpenHandler(view);

    view.webContents.loadURL(url);

    if (is.dev) {
      view.webContents.openDevTools({ mode: "bottom" });
    }

    return view;
  }

  private setWindowOpenHandler(view: WebContentsView) {
    view.webContents.setWindowOpenHandler(({ url, disposition }) => {
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
        this.openPdfViewerWindow(url);

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
          GoogleApp.reuseWindowByHostname(this.accountId, url)
        ) {
          return { action: "deny" };
        }

        new GoogleApp({
          accountId: this.accountId,
          url,
        });

        return { action: "deny" };
      }

      if (GOOGLE_CHAT_ATTACHMENT_URL_REGEXP.test(url)) {
        view.webContents.downloadURL(url);

        return { action: "deny" };
      }

      openExternalUrl(url, Boolean(matchedSupportedGoogleApp));

      return { action: "deny" };
    });
  }

  private openPdfViewerWindow(url: string) {
    const pdfWindow = new BrowserWindow({
      ...getCascadedWindowBounds({ width: 1280, height: 800 }),
      autoHideMenuBar: true,
      webPreferences: {
        session: this.account.instance.session,
        preload: getPreloadPath("google-app"),
      },
    });

    setupWindowContextMenu(pdfWindow);

    this.account.instance.windows.add(pdfWindow);

    pdfWindow.once("closed", () => {
      this.account.instance.windows.delete(pdfWindow);
    });

    pdfWindow.loadURL(url);
  }

  private handleClose = () => {
    this.unregisterViewListeners();

    this.teardownApp();

    this.account.instance.windows.delete(this.browserWindow);

    GoogleApp.instances.delete(this.browserWindow.webContents.id);
  };

  private setupApp() {
    if (this.app === "meet") {
      this.powerSaveBlockerId = powerSaveBlocker.start("prevent-display-sleep");

      globalShortcut.register("CommandOrControl+Shift+1", () => {
        ipc.renderer.send(this.view.webContents, "googleMeet.toggleMicrophone");
      });

      globalShortcut.register("CommandOrControl+Shift+2", () => {
        ipc.renderer.send(this.view.webContents, "googleMeet.toggleCamera");
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
    this.view.webContents.on("dom-ready", this.handleDomReady);
    this.view.webContents.on("did-navigate", this.broadcastNavigationState);
    this.view.webContents.on("did-navigate", this.handlePasskeyChallenge);
    this.view.webContents.on("did-navigate-in-page", this.broadcastNavigationState);
    this.view.webContents.on("page-title-updated", this.broadcastPageTitle);
    this.view.webContents.on("did-start-loading", this.broadcastLoadingState);
    this.view.webContents.on("did-stop-loading", this.broadcastLoadingState);
    this.view.webContents.on("will-redirect", this.handleGoogleRedirect);
    this.view.webContents.on("found-in-page", this.broadcastFindInPageResult);
  }

  private unregisterViewListeners() {
    this.view.webContents.removeListener("dom-ready", this.handleDomReady);
    this.view.webContents.removeListener("did-navigate", this.broadcastNavigationState);
    this.view.webContents.removeListener("did-navigate", this.handlePasskeyChallenge);
    this.view.webContents.removeListener("did-navigate-in-page", this.broadcastNavigationState);
    this.view.webContents.removeListener("page-title-updated", this.broadcastPageTitle);
    this.view.webContents.removeListener("did-start-loading", this.broadcastLoadingState);
    this.view.webContents.removeListener("did-stop-loading", this.broadcastLoadingState);
    this.view.webContents.removeListener("will-redirect", this.handleGoogleRedirect);
    this.view.webContents.removeListener("found-in-page", this.broadcastFindInPageResult);
  }

  private handleDomReady = () => {
    this.view.webContents.setVisualZoomLevelLimits(1, 3);
  };

  private handlePasskeyChallenge = (_event: Electron.Event, url: string) => {
    if (!url.startsWith(`${GOOGLE_ACCOUNTS_URL}/v3/signin/challenge/pk/presend`)) {
      return;
    }

    dialog.showMessageBox({
      type: "info",
      message: "Passkey sign-in not supported yet",
      detail: "Please use password to sign in.",
    });
  };

  private handleGoogleRedirect = (event: Electron.Event, url: string) => {
    if (
      !url.startsWith("https://www.google.com") &&
      !url.startsWith("https://workspace.google.com")
    ) {
      return;
    }

    event.preventDefault();

    this.view.webContents.loadURL(`${GOOGLE_ACCOUNTS_URL}/ServiceLogin?service=mail`);
  };

  broadcastNavigationState = () => {
    ipc.renderer.send(this.browserWindow.webContents, "googleApp.navigationStateChanged", {
      canGoBack: this.view.webContents.navigationHistory.canGoBack(),
      canGoForward: this.view.webContents.navigationHistory.canGoForward(),
    });
  };

  broadcastPageTitle = () => {
    ipc.renderer.send(
      this.browserWindow.webContents,
      "googleApp.pageTitleChanged",
      this.view.webContents.getTitle(),
    );
  };

  broadcastLoadingState = () => {
    ipc.renderer.send(
      this.browserWindow.webContents,
      "googleApp.loadingStateChanged",
      this.view.webContents.isLoading(),
    );
  };

  broadcastFindInPageResult = (_event: Electron.Event, result: Electron.Result) => {
    ipc.renderer.send(this.browserWindow.webContents, "findInPage.result", {
      activeMatch: result.activeMatchOrdinal,
      totalMatches: result.matches,
    });
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
    openExternalUrl(this.view.webContents.getURL(), true);
  }

  get account() {
    return accounts.getAccount(this.accountId);
  }
}
