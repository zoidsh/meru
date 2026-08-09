import { platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT, BASE_SPACING } from "@meru/shared/constants";
import type { BrowserWindow } from "electron";
import { WebContentsView } from "electron";
import { getPreloadPath, loadRenderer, type RendererPage } from "./window";

/**
 * A renderer page hung under the titlebar of the window it was opened from, as
 * a child view rather than renderer-drawn markup: child views paint above the
 * main window's HTML, so a dropdown would be covered wherever a workspace app
 * view sits.
 */
export class TitlebarPopup {
  private page: RendererPage;

  private width: number;

  private height: number;

  private view: WebContentsView | null = null;

  private parentWindow: BrowserWindow | null = null;

  /**
   * Held off while the pointer is over the button that toggles the popup, so
   * that clicking the button closes it rather than the blur closing it and the
   * click reopening it right away.
   */
  closeOnBlurEnabled = false;

  constructor({ page, width, height }: { page: RendererPage; width: number; height: number }) {
    this.page = page;
    this.width = width;
    this.height = height;
  }

  get webContents() {
    return this.view?.webContents ?? null;
  }

  private setBounds = () => {
    if (!this.view || !this.parentWindow) {
      return;
    }

    const parentWindowBounds = platform.isWindows
      ? this.parentWindow.getContentBounds()
      : this.parentWindow.getBounds();

    this.view.setBounds({
      x: parentWindowBounds.width - this.width - BASE_SPACING,
      y: APP_TITLEBAR_HEIGHT + BASE_SPACING,
      width: this.width,
      height: this.height,
    });
  };

  close = () => {
    if (!this.view || !this.parentWindow) {
      return;
    }

    this.view.webContents.removeAllListeners();

    this.view.webContents.close();

    this.parentWindow.contentView.removeChildView(this.view);

    this.parentWindow.removeListener("resize", this.setBounds);

    this.view = null;
    this.parentWindow = null;
  };

  /**
   * Returns whether the popup ended up open, so callers can refresh what it is
   * about to show. Toggling from the window it is already open in closes it;
   * from another window it moves there.
   */
  toggle(parentWindow: BrowserWindow) {
    if (this.view) {
      const wasSameWindow = this.parentWindow === parentWindow;

      this.close();

      if (wasSameWindow) {
        return false;
      }
    }

    this.view = new WebContentsView({
      webPreferences: {
        preload: getPreloadPath("renderer"),
      },
    });

    this.parentWindow = parentWindow;

    loadRenderer(this.view, { page: this.page });

    parentWindow.contentView.addChildView(this.view);

    this.setBounds();

    this.view.webContents.once("blur", () => {
      if (this.closeOnBlurEnabled) {
        this.close();
      }
    });

    parentWindow.on("resize", this.setBounds);

    this.view.setBorderRadius(BASE_SPACING * 2);

    return true;
  }
}
