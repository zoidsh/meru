import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import type { AccountConfig } from "@meru/shared/schemas";
import {
  clipboard,
  type BrowserWindow,
  type Session,
  type WebContents,
  WebContentsView,
} from "electron";
import { accounts } from "./accounts";
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

    this.browserWindow = createBrowserWindow({
      ...getCascadedWindowBounds({ width: 1280, height: 800 }),
      ...getCommonBrowserWindowOptions(),
    });

    const webContentsId = this.browserWindow.webContents.id;

    GoogleApp.instances.set(webContentsId, this);

    loadRenderer(this.browserWindow, {
      renderer: "google-app",
      port: 3002,
    });

    this.view = new WebContentsView({
      webPreferences: {
        session,
        preload: getPreloadPath("google-app"),
      },
    });

    this.browserWindow.contentView.addChildView(this.view);

    this.view.webContents.loadURL(url);

    this.updateViewBounds();

    this.browserWindow.on("resize", this.updateViewBounds);

    this.browserWindow.on("close", () => {
      this.view.webContents.removeListener("did-navigate", this.broadcastNavigationState);
      this.view.webContents.removeListener("did-navigate-in-page", this.broadcastNavigationState);
      this.view.webContents.removeListener("page-title-updated", this.broadcastPageTitle);
      this.view.webContents.removeListener("did-start-loading", this.broadcastLoadingState);
      this.view.webContents.removeListener("did-stop-loading", this.broadcastLoadingState);

      GoogleApp.instances.delete(webContentsId);
    });

    this.view.webContents.on("did-navigate", this.broadcastNavigationState);

    this.view.webContents.on("did-navigate-in-page", this.broadcastNavigationState);

    this.view.webContents.on("page-title-updated", this.broadcastPageTitle);

    this.view.webContents.on("did-start-loading", this.broadcastLoadingState);

    this.view.webContents.on("did-stop-loading", this.broadcastLoadingState);
  }

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
