import { platform } from "@electron-toolkit/utils";
import { APP_TITLEBAR_HEIGHT, BASE_SPACING } from "@meru/shared/constants";
import { clamp } from "@meru/shared/utils";
import type { BrowserWindow, Event, Input, Session, Size } from "electron";
import { WebContentsView } from "electron";
import { loadUrl } from "./load-url";
import { getPreloadPath, loadRenderer, type RendererPage } from "./window";

/** What a popup shows: a renderer page, or any URL loaded in a given session. */
export type PopupContent = { page: RendererPage } | { url: string; session: Session };

/**
 * Where the popup hangs from, in the parent window's content coordinates: `y`
 * is the popup's top edge and `x` the edge named by `align`. Left unset, the
 * popup hangs from the end of the titlebar, where the buttons that open it sit.
 */
export type PopupAnchor = { x: number; y: number; align: "start" | "end" };

export type PopupOptions = {
  content: PopupContent;
  /** The size of the popup itself, without the gaps the view spans. */
  width: number | "preferred";
  /** `fill` reaches the bottom of the window, leaving the gap it hangs by. */
  height: number | "fill" | "preferred";
  anchor?: PopupAnchor;
};

/** What a popup sized by its page gets until the page has reported a size. */
const PREFERRED_SIZE_FALLBACK = { width: BASE_SPACING * 44, height: BASE_SPACING * 60 };

/** Chrome's ceiling for an action popup, which is what sizes itself here. */
const PREFERRED_SIZE_MAX = { width: 800, height: 600 };

function isSameContent(content: PopupContent, otherContent: PopupContent) {
  if ("page" in content) {
    return "page" in otherContent && content.page === otherContent.page;
  }

  return (
    !("page" in otherContent) &&
    content.url === otherContent.url &&
    content.session === otherContent.session
  );
}

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
 * Any other page fills its view instead — an extension's popup doesn't account for
 * Meru's gaps and would paint over them.
 */
export class Popup {
  private options: PopupOptions | null = null;

  private preferredSize: { width: number; height: number } | null = null;

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

    const padding = "page" in options.content ? BASE_SPACING : 0;

    const width =
      options.width === "preferred"
        ? Math.min(
            this.preferredSize?.width ?? PREFERRED_SIZE_FALLBACK.width,
            PREFERRED_SIZE_MAX.width,
          )
        : options.width;

    const anchor = options.anchor ?? {
      x: parentWindowBounds.width - padding,
      y: APP_TITLEBAR_HEIGHT + padding,
      align: "end" as const,
    };

    const viewWidth = width + padding * 2;

    const viewY = anchor.y - padding;

    const availableHeight = Math.max(parentWindowBounds.height - viewY, 0);

    const viewHeight =
      options.height === "fill"
        ? availableHeight
        : options.height === "preferred"
          ? Math.min(
              this.preferredSize?.height ?? PREFERRED_SIZE_FALLBACK.height,
              PREFERRED_SIZE_MAX.height,
            )
          : options.height + padding * 2;

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

  private handlePreferredSizeChanged = (_event: Event, size: Size) => {
    this.preferredSize = size;

    this.setBounds();
  };

  private handleBlur = () => {
    if (this.closeOnBlurEnabled) {
      this.close();
    }
  };

  private handleInput = (_event: Event, input: Input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
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

    this.view = null;
    this.parentWindow = null;
    this.options = null;
    this.preferredSize = null;
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

      view.webContents.off("before-input-event", this.handleInput);

      view.webContents.off("preferred-size-changed", this.handlePreferredSizeChanged);

      view.webContents.close();
    }
  };

  /**
   * Returns whether the popup ended up open, so callers can refresh what it is
   * about to show. Toggling it with the same window, content and anchor closes
   * it; anything else about the popup changing reopens it.
   */
  toggle(parentWindow: BrowserWindow, options: PopupOptions) {
    const openOptions = this.options;

    if (this.view) {
      const wasSamePopup =
        this.parentWindow === parentWindow &&
        openOptions !== null &&
        isSameContent(openOptions.content, options.content) &&
        isSameAnchor(openOptions.anchor, options.anchor);

      this.close();

      if (wasSamePopup) {
        return false;
      }
    }

    const { content } = options;

    const isPage = "page" in content;

    const followsPreferredSize = options.width === "preferred" || options.height === "preferred";

    this.view = new WebContentsView({
      webPreferences: {
        ...(isPage ? { preload: getPreloadPath("renderer") } : { session: content.session }),
        enablePreferredSizeMode: followsPreferredSize,
      },
    });

    // The page paints its own background as it fades in, so the view stays clear
    // instead of flashing white until the first frame lands
    this.view.setBackgroundColor("#00000000");

    this.parentWindow = parentWindow;

    this.options = options;

    if (isPage) {
      loadRenderer(this.view, { page: content.page });
    } else {
      void loadUrl(this.view.webContents, content.url);
    }

    parentWindow.contentView.addChildView(this.view);

    this.setBounds();

    if (followsPreferredSize) {
      this.view.webContents.on("preferred-size-changed", this.handlePreferredSizeChanged);
    }

    this.view.webContents.once("blur", this.handleBlur);

    if (!isPage) {
      // A renderer page closes itself on Escape and calls the view's own way
      // back here; an arbitrary page has neither, and neither can blur before
      // the view has been given focus
      this.view.webContents.on("before-input-event", this.handleInput);

      this.view.webContents.focus();

      // Extension popups end themselves with `window.close()` once they are done
      this.view.webContents.once("destroyed", this.close);
    }

    parentWindow.on("resize", this.setBounds);

    // A window closing out from under the popup — a workspace app window it was
    // hung on, or the main window on quit — leaves the view attached to
    // something that is going away, so the popup comes down with it
    parentWindow.once("closed", this.close);

    return true;
  }
}
