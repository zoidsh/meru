import { platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT, BASE_SPACING } from "@meru/shared/constants";
import type { BrowserWindow } from "electron";
import { WebContentsView } from "electron";
import { getPreloadPath, loadRenderer, type RendererPage } from "./window";

/**
 * A renderer page drawn over the window it was opened from, as a child view
 * rather than renderer-drawn markup: child views paint above the main window's
 * HTML, so a dropdown would be covered wherever a workspace app view sits.
 */
export class Popup {
  private page: RendererPage;

  private width: number;

  /** `fill` reaches the bottom of the window, leaving the gap it hangs by. */
  private height: number | "fill";

  private view: WebContentsView | null = null;

  private parentWindow: BrowserWindow | null = null;

  /**
   * Where the popup starts horizontally, for a caller that wants it somewhere
   * other than the end of the titlebar — the bookmarks button in the vertical
   * tabs strip hangs it beside the strip instead.
   */
  private anchorX: number | null = null;

  /**
   * Held off while the pointer is over the button that toggles the popup, so
   * that clicking the button closes it rather than the blur closing it and the
   * click reopening it right away.
   */
  closeOnBlurEnabled = false;

  constructor({
    page,
    width,
    height,
  }: {
    page: RendererPage;
    width: number;
    height: number | "fill";
  }) {
    this.page = page;
    this.width = width;
    this.height = height;
  }

  get webContents() {
    return this.view?.webContents ?? null;
  }

  private setBounds = () => {
    if (!this.view || !this.parentWindow || this.parentWindow.isDestroyed()) {
      return;
    }

    const parentWindowBounds = platform.isWindows
      ? this.parentWindow.getContentBounds()
      : this.parentWindow.getBounds();

    const y = APP_TITLEBAR_HEIGHT + BASE_SPACING;

    this.view.setBounds({
      x: this.anchorX ?? parentWindowBounds.width - this.width - BASE_SPACING,
      y,
      width: this.width,
      height: this.height === "fill" ? parentWindowBounds.height - y - BASE_SPACING : this.height,
    });
  };

  private handleBlur = () => {
    if (this.closeOnBlurEnabled) {
      this.close();
    }
  };

  /**
   * Quitting tears the window down underneath an open popup, and the blur that
   * comes with it lands here while the window and the view are already going
   * away — so the state is dropped up front and every native object is checked
   * before it is touched, leaving nothing half torn down to hang the quit on.
   */
  close = () => {
    const { view, parentWindow } = this;

    this.view = null;
    this.parentWindow = null;
    this.anchorX = null;
    this.closeOnBlurEnabled = false;

    if (!view || !parentWindow) {
      return;
    }

    if (!parentWindow.isDestroyed()) {
      parentWindow.removeListener("resize", this.setBounds);

      parentWindow.removeListener("closed", this.close);

      parentWindow.contentView.removeChildView(view);
    }

    if (!view.webContents.isDestroyed()) {
      // Only the listener this class added comes off: removing them all takes
      // Electron's own with it and leaves the webContents unable to tear down.
      view.webContents.off("blur", this.handleBlur);

      view.webContents.close();
    }
  };

  /**
   * Returns whether the popup ended up open, so callers can refresh what it is
   * about to show.
   */
  toggle(parentWindow: BrowserWindow, { anchorX }: { anchorX?: number } = {}) {
    if (this.view) {
      const wasSameWindow = this.parentWindow === parentWindow;

      const wasSameAnchorX = this.anchorX === (anchorX ?? null);

      this.close();

      if (wasSameWindow && wasSameAnchorX) {
        return false;
      }
    }

    this.view = new WebContentsView({
      webPreferences: {
        preload: getPreloadPath("renderer"),
      },
    });

    // The page paints its own background as it fades in, so the view stays clear
    // instead of flashing white until the first frame lands
    this.view.setBackgroundColor("#00000000");

    this.parentWindow = parentWindow;

    this.anchorX = anchorX ?? null;

    loadRenderer(this.view, { page: this.page });

    parentWindow.contentView.addChildView(this.view);

    this.setBounds();

    this.view.webContents.once("blur", this.handleBlur);

    parentWindow.on("resize", this.setBounds);

    // A window closing out from under the popup — a workspace app window it was
    // hung on, or the main window on quit — leaves the view attached to
    // something that is going away, so the popup comes down with it
    parentWindow.once("closed", this.close);

    this.view.setBorderRadius(BASE_SPACING * 2);

    return true;
  }
}
