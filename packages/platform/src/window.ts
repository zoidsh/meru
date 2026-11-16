import type { Rectangle, Size } from "@meru/core/window-bounds";
import { BrowserWindow } from "electron";

export interface WindowOptions {
  title: string;
  bounds: Rectangle;
  minimumSize: Size;
  /** `hiddenInset` keeps the macOS traffic lights over a page-drawn titlebar. */
  titleBarStyle: "default" | "hiddenInset";
  preloadPath: string;
  /** The window may navigate only within this URL's scheme and host. */
  contentUrl: string;
}

export type WindowLoadEvent = "ready-to-show" | "did-finish-load";

export interface AppWindow {
  loadURL: (url: string) => Promise<void>;
  once: (event: WindowLoadEvent, listener: () => void) => void;
  show: () => void;
  /** Shows the window without activating the app or taking focus. */
  showInactive: () => void;
  focus: () => void;
  restore: () => void;
  isMinimized: () => boolean;
  isDestroyed: () => boolean;
}

export interface WindowFactory {
  create: (options: WindowOptions) => AppWindow;
}

/**
 * Compared by scheme and host rather than `URL.origin`, which Node's URL gives
 * as `"null"` for every scheme it does not know, `meru-app:` included.
 */
const isSameSite = (url: string, contentUrl: string) => {
  try {
    const target = new URL(url);
    const content = new URL(contentUrl);

    return target.protocol === content.protocol && target.host === content.host;
  } catch {
    return false;
  }
};

export const createWindowFactory = (): WindowFactory => ({
  create: (options) => {
    const window = new BrowserWindow({
      title: options.title,
      ...options.bounds,
      minWidth: options.minimumSize.width,
      minHeight: options.minimumSize.height,
      show: false,
      titleBarStyle: options.titleBarStyle,
      webPreferences: {
        preload: options.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });

    const { webContents } = window;

    webContents.on("will-navigate", (event) => {
      if (!isSameSite(event.url, options.contentUrl)) {
        event.preventDefault();
      }
    });

    webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    return {
      loadURL: (url) => window.loadURL(url),
      once: (event, listener) => {
        if (event === "ready-to-show") {
          window.once("ready-to-show", listener);
        } else {
          webContents.once("did-finish-load", listener);
        }
      },
      show: () => window.show(),
      showInactive: () => window.showInactive(),
      focus: () => window.focus(),
      restore: () => window.restore(),
      isMinimized: () => window.isMinimized(),
      isDestroyed: () => window.isDestroyed(),
    };
  },
});
