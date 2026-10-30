import { platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT, BASE_SPACING } from "@meru/shared/constants";
import { clamp } from "@meru/shared/utils";
import type { BrowserWindow, Event, Input, Rectangle } from "electron";
import { WebContentsView } from "electron";
import { watchForAppMenuKey } from "@/app-menu-shortcut";
import { getPreloadPath, loadRenderer, type RendererPage } from "./window";

/**
 * Where the popup hangs from, in the parent window's content coordinates: `y`
 * is the popup's top edge and `x` the edge named by `align`. Left unset, the
 * popup hangs from the end of the titlebar, where the buttons that open it sit.
 */
export type PopupAnchor = { x: number; y: number; align: "start" | "end" };

export type PopupOptions = {
  page: RendererPage;
  searchParams?: URLSearchParams;
  /**
   * The size of the popup itself, without the gaps the view spans. `fill`
   * spans the whole window with no gaps, for a page that draws its own
   * backdrop over everything.
   */
  width: number | "fill";
  /** `fill` reaches the bottom of the window, leaving the gap it hangs by. */
  height: number | "fill";
  anchor?: PopupAnchor;
  /**
   * Off for a page that shows content from outside Meru, so that nothing
   * slipping past its sanitizing finds a bridge to the main process. With no
   * bridge to ask through, such a page closes itself by setting its fragment
   * to `#close`.
   */
  preload?: boolean;
  closeOnEscape?: boolean;
  /** Kept above every view added to the window while it is open. */
  stayOnTop?: boolean;
  /** Called when Escape or the page itself closes the popup, and on no other close. */
  onDismiss?: () => void;
};

const CLOSE_FRAGMENT = "#close";

function isSameAnchor(anchor: PopupAnchor | undefined, otherAnchor: PopupAnchor | undefined) {
  if (!anchor || !otherAnchor) {
    return anchor === otherAnchor;
  }

  return (
    anchor.x === otherAnchor.x && anchor.y === otherAnchor.y && anchor.align === otherAnchor.align
  );
}

const openPopups = new Set<Popup>();

/**
 * A page drawn over the window it was opened from, as a child view rather than
 * renderer-drawn markup: child views paint above the main window's HTML, so a
 * dropdown would be covered wherever a workspace app view sits.
 *
 * A renderer page pads itself by `BASE_SPACING`, and the view spans that much
 * past the popup on every side, so the popup sits where the gaps put it and its
 * entrance animation has room to move without being cut off at the view edge.
 */
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

  private restoreAddChildView: (() => void) | null = null;

  /*
   * Adding a view puts it on top, and views reach the window from accounts,
   * Gmail, workspace apps and tab switches alike, each re-adding to raise its
   * own. Wrapping the one method they all go through keeps the popup above
   * every one of them, including any added later, without each caller knowing
   * a popup is open.
   */
  private keepOnTop(parentWindow: BrowserWindow) {
    const { contentView } = parentWindow;

    const addChildView = contentView.addChildView;

    contentView.addChildView = (view, index) => {
      addChildView.call(contentView, view, index);

      if (this.view && view !== this.view) {
        addChildView.call(contentView, this.view);
      }
    };

    this.restoreAddChildView = () => {
      contentView.addChildView = addChildView;
    };
  }

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

    const fillsWidth = options.width === "fill";

    const padding = fillsWidth ? 0 : BASE_SPACING;

    const width = options.width === "fill" ? parentWindowBounds.width : options.width;

    const anchor =
      options.anchor ??
      (fillsWidth
        ? { x: 0, y: 0, align: "start" as const }
        : {
            x: parentWindowBounds.width - padding,
            y: APP_TITLEBAR_HEIGHT + padding,
            align: "end" as const,
          });

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

  private dismiss() {
    const onDismiss = this.options?.onDismiss;

    this.close();

    onDismiss?.();
  }

  /*
   * The app menu key's listener on the same event stays for the webContents'
   * life and keeps a gesture state of its own; this one comes off with the
   * popup.
   */
  private handleBeforeInputEvent = (event: Event, input: Input) => {
    if (
      input.type === "keyDown" &&
      input.key === "Escape" &&
      !input.alt &&
      !input.control &&
      !input.meta &&
      !input.shift
    ) {
      event.preventDefault();

      this.dismiss();
    }
  };

  private handleDidNavigateInPage = (_event: Event, url: string) => {
    if (URL.parse(url)?.hash === CLOSE_FRAGMENT) {
      this.dismiss();
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

    this.restoreAddChildView?.();
    this.restoreAddChildView = null;

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

      view.webContents.off("before-input-event", this.handleBeforeInputEvent);

      view.webContents.off("did-navigate-in-page", this.handleDidNavigateInPage);

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
      webPreferences:
        options.preload === false
          ? { sandbox: true, contextIsolation: true, nodeIntegration: false }
          : { preload: getPreloadPath("renderer") },
    });

    watchForAppMenuKey(this.view.webContents);

    // The page paints its own background as it fades in, so the view stays clear
    // instead of flashing white until the first frame lands
    this.view.setBackgroundColor("#00000000");

    this.parentWindow = parentWindow;

    this.options = options;

    loadRenderer(this.view, { page: options.page, searchParams: options.searchParams });

    parentWindow.contentView.addChildView(this.view);

    if (options.stayOnTop) {
      this.keepOnTop(parentWindow);
    }

    this.setBounds();

    this.view.webContents.once("blur", this.handleBlur);

    if (options.closeOnEscape) {
      this.view.webContents.on("before-input-event", this.handleBeforeInputEvent);
    }

    if (options.preload === false) {
      this.view.webContents.on("did-navigate-in-page", this.handleDidNavigateInPage);
    }

    parentWindow.on("resize", this.setBounds);

    // A window closing out from under the popup — a workspace app window it was
    // hung on, or the main window on quit — leaves the view attached to
    // something that is going away, so the popup comes down with it
    parentWindow.once("closed", this.close);

    openPopups.add(this);

    return true;
  }
}
