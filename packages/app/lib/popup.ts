import { platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT, BASE_SPACING } from "@meru/shared/constants";
import { clamp } from "@meru/shared/utils";
import type { BrowserWindow, Rectangle } from "electron";
import { WebContentsView } from "electron";
import { getPreloadPath, loadRenderer, type RendererPage } from "./window";

/**
 * Where the popup hangs from, in the parent window's content coordinates: `y`
 * is the popup's top edge and `x` the edge named by `align`. Left unset, the
 * popup hangs from the end of the titlebar, where the buttons that open it sit.
 */
export type PopupAnchor = { x: number; y: number; align: "start" | "end" };

export type PopupOptions = {
  page: RendererPage;
  /** The size of the popup itself, without the gaps the view spans. */
  width: number;
  /** `fill` reaches the bottom of the window, leaving the gap it hangs by. */
  height: number | "fill";
  anchor?: PopupAnchor;
};

function isSameAnchor(anchor: PopupAnchor | undefined, otherAnchor: PopupAnchor | undefined) {
  if (!anchor || !otherAnchor) {
    return anchor === otherAnchor;
  }

  return (
    anchor.x === otherAnchor.x && anchor.y === otherAnchor.y && anchor.align === otherAnchor.align
  );
}

/**
 * A page drawn over the window it was opened from, as a child view rather than
 * renderer-drawn markup: child views paint above the main window's HTML, so a
 * dropdown would be covered wherever a workspace app view sits.
 *
 * A renderer page pads itself by `BASE_SPACING`, and the view spans that much
 * past the popup on every side, so the popup sits where the gaps put it and its
 * entrance animation has room to move without being cut off at the view edge.
 */
const openPopups = new Set<Popup>();

export class Popup {
  /**
   * Where each popup open over `parentWindow` sits, in its content coordinates,
   * so a gesture over one is not answered by the view underneath.
   */
  static getOpenBoundsIn(parentWindow: BrowserWindow) {
    const bounds: Rectangle[] = [];

    for (const popup of openPopups) {
      if (popup.parentWindow === parentWindow && popup.view) {
        bounds.push(popup.view.getBounds());
      }
    }

    return bounds;
  }

  private options: PopupOptions | null = null;

  private view: WebContentsView | null = null;

  private parentWindow: BrowserWindow | null = null;

  /**
   * Held off while the pointer is over the button that toggles the popup, so
   * that clicking the button closes it rather than the blur closing it and the
   * click reopening it right away.
   */
  closeOnBlurEnabled = false;

  get webContents() {
    return this.view?.webContents ?? null;
  }

  private setBounds = () => {
    const { view, parentWindow, options } = this;

    if (!view || !parentWindow || !options || parentWindow.isDestroyed()) {
      return;
    }

    const parentWindowBounds = platform.isWindows
      ? parentWindow.getContentBounds()
      : parentWindow.getBounds();

    const padding = BASE_SPACING;

    const { width } = options;

    const anchor = options.anchor ?? {
      x: parentWindowBounds.width - padding,
      y: APP_TITLEBAR_HEIGHT + padding,
      align: "end" as const,
    };

    const viewWidth = width + padding * 2;

    const viewY = anchor.y - padding;

    const availableHeight = Math.max(parentWindowBounds.height - viewY, 0);

    const viewHeight = options.height === "fill" ? availableHeight : options.height + padding * 2;

    view.setBounds({
      x: clamp(
        (anchor.align === "start" ? anchor.x : anchor.x - width) - padding,
        0,
        Math.max(parentWindowBounds.width - viewWidth, 0),
      ),
      y: viewY,
      width: viewWidth,
      height: Math.min(viewHeight, availableHeight),
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
   * before it is touched, leaving nothing half torn down to stall the quit.
   */
  close = () => {
    const { view, parentWindow } = this;

    openPopups.delete(this);

    this.view = null;
    this.parentWindow = null;
    this.options = null;
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
      // Only the listeners this class added come off: removing them all takes
      // Electron's own with it and leaves the webContents unable to tear down.
      view.webContents.off("blur", this.handleBlur);

      view.webContents.close();
    }
  };

  /**
   * Returns whether the popup ended up open, so callers can refresh what it is
   * about to show. Toggling it with the same window, page and anchor closes it;
   * anything else about the popup changing reopens it.
   */
  toggle(parentWindow: BrowserWindow, options: PopupOptions) {
    const openOptions = this.options;

    if (this.view) {
      const wasSamePopup =
        this.parentWindow === parentWindow &&
        openOptions !== null &&
        openOptions.page === options.page &&
        isSameAnchor(openOptions.anchor, options.anchor);

      this.close();

      if (wasSamePopup) {
        return false;
      }
    }

    this.view = new WebContentsView({
      webPreferences: { preload: getPreloadPath("renderer") },
    });

    // The page paints its own background as it fades in, so the view stays clear
    // instead of flashing white until the first frame lands
    this.view.setBackgroundColor("#00000000");

    this.parentWindow = parentWindow;

    this.options = options;

    loadRenderer(this.view, { page: options.page });

    parentWindow.contentView.addChildView(this.view);

    this.setBounds();

    this.view.webContents.once("blur", this.handleBlur);

    parentWindow.on("resize", this.setBounds);

    // A window closing out from under the popup — a workspace app window it was
    // hung on, or the main window on quit — leaves the view attached to
    // something that is going away, so the popup comes down with it
    parentWindow.once("closed", this.close);

    openPopups.add(this);

    return true;
  }
}
