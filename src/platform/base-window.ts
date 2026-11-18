import type { BaseWindow, BaseWindowConstructorOptions } from "electron";

import { TITLEBAR_HEIGHT } from "#core/layout.ts";
import type { Rectangle, Size } from "#core/window-bounds.ts";

import type {
  ContextMenuItem,
  ContextMenus,
  MenuPoint,
} from "./context-menu.ts";
import { viewHost } from "./view-host.ts";
import type { ViewHost } from "./view-host.ts";

/** What every window of Meru's is opened with, the main one and a tab's own. */
export interface BaseWindowOptions {
  title: string;
  bounds: Rectangle;
  minimumSize: Size;
  /** `hiddenInset` keeps the macOS traffic lights over a page-drawn titlebar. */
  titleBarStyle: "default" | "hiddenInset";
  /** Shown where nothing has painted, as `#rrggbb`. */
  backgroundColor: string;
}

/**
 * The macOS traffic lights' height, as measured from a capture on macOS 27;
 * Electron offers no way to read it, and it differs between versions.
 */
const TRAFFIC_LIGHTS_HEIGHT = 14;

/**
 * Where the traffic lights go over a page-drawn titlebar: centred in its
 * height, level with its buttons, which `hiddenInset` alone sets 2 higher.
 */
const TRAFFIC_LIGHTS = {
  x: 12,
  y: (TITLEBAR_HEIGHT - TRAFFIC_LIGHTS_HEIGHT) / 2,
};

/** Electron's options for one, hidden until shown. */
export const baseWindowOptions = (
  options: BaseWindowOptions
): BaseWindowConstructorOptions => ({
  title: options.title,
  ...options.bounds,
  minWidth: options.minimumSize.width,
  minHeight: options.minimumSize.height,
  show: false,
  titleBarStyle: options.titleBarStyle,
  ...(options.titleBarStyle === "hiddenInset" && {
    trafficLightPosition: TRAFFIC_LIGHTS,
  }),
  backgroundColor: options.backgroundColor,
  // Windows and Linux show the application menu's bar only while Alt is held
  // or after it is pressed, so the content keeps its height.
  autoHideMenuBar: true,
});

/** What every window of Meru's offers, whatever it holds. */
export interface PlainWindow {
  /** What views are put in it by. */
  readonly host: ViewHost;
  show: () => void;
  showInactive: () => void;
  hide: () => void;
  focus: () => void;
  /** Whether keys go to this window, which an inactive app never is. */
  isFocused: () => boolean;
  isVisible: () => boolean;
  isMinimized: () => boolean;
  restore: () => void;
  setTitle: (title: string) => void;
  setBackgroundColor: (color: string) => void;
  getBounds: () => Rectangle;
  /** The area child views are laid out in, below any menu bar. */
  getContentAreaSize: () => Size;
  onContentAreaResize: (listener: () => void) => void;
  /** Told as it is moved or resized. */
  onBoundsChange: (listener: () => void) => void;
  /** Told as it is asked to close; `preventDefault` keeps it open. */
  onClose: (listener: (event: { preventDefault: () => void }) => void) => void;
  /** Told once it has closed. */
  onClosed: (listener: () => void) => void;
  /** Told when it becomes the window keys go to. */
  onFocus: (listener: () => void) => void;
  /** Windows alone: the session ends, for a shutdown, restart or sign-out. */
  onSessionEnd: (listener: () => void) => void;
  /** Closes it at once, asking nothing. */
  destroy: () => void;
  isDestroyed: () => boolean;
  /** A native menu at `at` in its content area, or at the pointer. */
  showContextMenu: (items: readonly ContextMenuItem[], at?: MenuPoint) => void;
}

export const plainWindow = (
  window: BaseWindow,
  menus: ContextMenus
): PlainWindow => ({
  host: viewHost(window),
  show: () => window.show(),
  showInactive: () => window.showInactive(),
  hide: () => window.hide(),
  focus: () => window.focus(),
  isFocused: () => window.isFocused(),
  isVisible: () => window.isVisible(),
  isMinimized: () => window.isMinimized(),
  restore: () => window.restore(),
  setTitle: (title) => window.setTitle(title),
  setBackgroundColor: (color) => window.setBackgroundColor(color),
  getBounds: () => window.getBounds(),
  // The root view rather than the window's content size, which on Windows
  // changes after a hidden window is first shown with no `resize`.
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
  onClosed: (listener) => {
    window.on("closed", listener);
  },
  onFocus: (listener) => {
    window.on("focus", listener);
  },
  onSessionEnd: (listener) => {
    window.on("session-end", listener);
  },
  destroy: () => {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  },
  isDestroyed: () => window.isDestroyed(),
  showContextMenu: (items, at) => {
    menus.popup(window, items, at);
  },
});
