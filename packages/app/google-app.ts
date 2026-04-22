import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import { type BrowserWindow, type Session, WebContentsView } from "electron";
import {
  createBrowserWindow,
  getCascadedWindowBounds,
  getCommonBrowserWindowOptions,
  getPreloadPath,
  loadRenderer,
} from "./lib/window";

type GoogleAppOptions = {
  url: string;
  session: Session;
};

export class GoogleApp {
  browserWindow: BrowserWindow;

  view: WebContentsView;

  constructor({ url, session }: GoogleAppOptions) {
    this.browserWindow = createBrowserWindow({
      ...getCascadedWindowBounds({ width: 1280, height: 800 }),
      ...getCommonBrowserWindowOptions(),
    });

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
  }

  updateViewBounds = () => {
    const { width, height } = this.browserWindow.getContentBounds();

    this.view.setBounds({
      x: 0,
      y: APP_TITLEBAR_HEIGHT,
      width,
      height: height - APP_TITLEBAR_HEIGHT,
    });
  };
}
