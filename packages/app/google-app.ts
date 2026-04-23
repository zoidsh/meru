import { is } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT, GOOGLE_ACCOUNTS_URL } from "@meru/shared/constants";
import type { AccountConfig } from "@meru/shared/schemas";
import {
  clipboard,
  type BrowserWindow,
  dialog,
  type Session,
  type WebContents,
  WebContentsView,
} from "electron";
import { accounts } from "./accounts";
import { setupWindowContextMenu } from "./context-menu";
import { ipc } from "./ipc";
import {
  createBrowserWindow,
  getCascadedWindowBounds,
  getCommonBrowserWindowOptions,
  getPreloadPath,
  loadRenderer,
} from "./lib/window";
import { openExternalUrl } from "./url";

type GoogleAppOptions = {
  accountId: AccountConfig["id"];
  url: string;
  session: Session;
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

  accountId: AccountConfig["id"];

  browserWindow: BrowserWindow;

  view: WebContentsView;

  constructor({ accountId, url, session }: GoogleAppOptions) {
    this.accountId = accountId;
    this.browserWindow = this.createToolbarWindow();
    this.view = this.createView({ url, session });

    this.updateViewBounds();
    this.registerViewListeners();

    this.browserWindow.on("resize", this.updateViewBounds);
    this.browserWindow.on("close", this.handleClose);

    this.account.instance.windows.add(this.browserWindow);

    GoogleApp.instances.set(this.browserWindow.webContents.id, this);
  }

  private createToolbarWindow() {
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

  private createView({ url, session }: { url: string; session: Session }) {
    const view = new WebContentsView({
      webPreferences: {
        session,
        preload: getPreloadPath("google-app"),
      },
    });

    this.browserWindow.contentView.addChildView(view);

    setupWindowContextMenu(view);

    view.webContents.loadURL(url);

    if (is.dev) {
      view.webContents.openDevTools({ mode: "bottom" });
    }

    return view;
  }

  private handleClose = () => {
    this.unregisterViewListeners();

    this.account.instance.windows.delete(this.browserWindow);

    GoogleApp.instances.delete(this.browserWindow.webContents.id);
  };

  private registerViewListeners() {
    this.view.webContents.on("dom-ready", this.handleDomReady);
    this.view.webContents.on("did-navigate", this.broadcastNavigationState);
    this.view.webContents.on("did-navigate", this.handlePasskeyChallenge);
    this.view.webContents.on("did-navigate-in-page", this.broadcastNavigationState);
    this.view.webContents.on("page-title-updated", this.broadcastPageTitle);
    this.view.webContents.on("did-start-loading", this.broadcastLoadingState);
    this.view.webContents.on("did-stop-loading", this.broadcastLoadingState);
    this.view.webContents.on("will-redirect", this.handleGoogleRedirect);
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
