import { BaseWindow } from "electron";

import type { Rectangle, Size } from "#core/window-bounds.ts";

import { viewHost } from "./view-host.ts";
import type { ViewHost } from "./view-host.ts";

export interface OwnWindowOptions {
  title: string;
  bounds: Rectangle;
  minimumSize: Size;
  /** `hiddenInset` keeps the macOS traffic lights over a page-drawn titlebar. */
  titleBarStyle: "default" | "hiddenInset";
  /** Shown where nothing has painted, as `#rrggbb`. */
  backgroundColor: string;
}

/**
 * A tab's own window: no page of its own, only the views put in it, the
 * tab's page and the shell's titlebar document behind it.
 */
export interface OwnWindow {
  readonly host: ViewHost;
  show: () => void;
  showInactive: () => void;
  focus: () => void;
  isFocused: () => boolean;
  isMinimized: () => boolean;
  restore: () => void;
  setTitle: (title: string) => void;
  setBackgroundColor: (color: string) => void;
  getBounds: () => Rectangle;
  /** The area its views are laid out in, below any menu bar. */
  getContentAreaSize: () => Size;
  onContentAreaResize: (listener: () => void) => void;
  /** Told as it is moved or resized. */
  onBoundsChange: (listener: () => void) => void;
  /** Told as it is asked to close; `preventDefault` keeps it open. */
  onClose: (listener: (event: { preventDefault: () => void }) => void) => void;
  /** Told when it becomes the window keys go to. */
  onFocus: (listener: () => void) => void;
  /** Closes it at once, asking nothing. */
  destroy: () => void;
  isDestroyed: () => boolean;
}

export interface OwnWindowFactory {
  create: (options: OwnWindowOptions) => OwnWindow;
}

export const createOwnWindowFactory = (): OwnWindowFactory => ({
  create: (options) => {
    const window = new BaseWindow({
      title: options.title,
      ...options.bounds,
      minWidth: options.minimumSize.width,
      minHeight: options.minimumSize.height,
      show: false,
      titleBarStyle: options.titleBarStyle,
      backgroundColor: options.backgroundColor,
      // As the main window's: on Windows and Linux the application menu's
      // bar shows only while Alt is held or after it is pressed.
      autoHideMenuBar: true,
    });

    return {
      host: viewHost(window),
      show: () => window.show(),
      showInactive: () => window.showInactive(),
      focus: () => window.focus(),
      isFocused: () => window.isFocused(),
      isMinimized: () => window.isMinimized(),
      restore: () => window.restore(),
      setTitle: (title) => window.setTitle(title),
      setBackgroundColor: (color) => window.setBackgroundColor(color),
      getBounds: () => window.getBounds(),
      // The root view, as the main window's, rather than the content size.
      getContentAreaSize: () => {
        const { width, height } = window.contentView.getBounds();

        return { width, height };
      },
      onContentAreaResize: (listener) => {
        window.contentView.on("bounds-changed", listener);
      },
      onBoundsChange: (listener) => {
        window.on("resize", listener);
        window.on("move", listener);
      },
      onClose: (listener) => {
        window.on("close", listener);
      },
      onFocus: (listener) => {
        window.on("focus", listener);
      },
      destroy: () => {
        if (!window.isDestroyed()) {
          window.destroy();
        }
      },
      isDestroyed: () => window.isDestroyed(),
    };
  },
});
