import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import {
  clipboard,
  type BrowserWindow,
  type Session,
  type WebContents,
  WebContentsView,
} from "electron";
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

  browserWindow: BrowserWindow;

  view: WebContentsView;

  constructor({ url, session }: GoogleAppOptions) {
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

    this.browserWindow.on("closed", () => {
      GoogleApp.instances.delete(webContentsId);
    });

    this.view.webContents.on("did-navigate", this.broadcastNavigationState);

    this.view.webContents.on("did-navigate-in-page", this.broadcastNavigationState);
  }

  broadcastNavigationState = () => {
    ipc.renderer.send(this.browserWindow.webContents, "googleApp.navigationStateChanged", {
      canGoBack: this.view.webContents.navigationHistory.canGoBack(),
      canGoForward: this.view.webContents.navigationHistory.canGoForward(),
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

  copyUrl() {
    clipboard.writeText(this.view.webContents.getURL());
  }

  openInBrowser() {
    openExternalUrl(this.view.webContents.getURL(), true);
  }
}
