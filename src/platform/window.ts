import { BrowserWindow, Menu, dialog } from "electron";

import { isSameSite } from "#core/app-url.ts";
import type { Rectangle, Size } from "#core/window-bounds.ts";

import { addContentView } from "./content-view.ts";
import type { ContentView, ContentViewOptions } from "./content-view.ts";

export interface WindowOptions {
  title: string;
  bounds: Rectangle;
  minimumSize: Size;
  /** `hiddenInset` keeps the macOS traffic lights over a page-drawn titlebar. */
  titleBarStyle: "default" | "hiddenInset";
  preloadPath: string;
  /** The window may navigate only within this URL's scheme and host. */
  contentUrl: string;
  /** On macOS, whether the desktop shows through, blurred, where the page is clear. */
  vibrancy: boolean;
}

// The sidebar material, kept active while the window is not the key window,
// as a sidebar is.
const VIBRANCY = "sidebar";

export interface ContextMenuItem {
  label: string;
  enabled: boolean;
  click: () => void;
}

export interface Confirmation {
  message: string;
  detail: string;
  confirmLabel: string;
  cancelLabel: string;
}

export type WindowLoadEvent = "ready-to-show" | "did-finish-load";

export interface AppWindow {
  readonly webContentsId: number;
  loadURL: (url: string) => Promise<void>;
  once: (event: WindowLoadEvent, listener: () => void) => void;
  show: () => void;
  showInactive: () => void;
  focus: () => void;
  restore: () => void;
  isMinimized: () => boolean;
  isDestroyed: () => boolean;
  /** macOS only; elsewhere nothing. */
  setVibrancy: (vibrancy: boolean) => void;
  /** The area child views are laid out in, below any menu bar. */
  getContentAreaSize: () => Size;
  onContentAreaResize: (listener: () => void) => void;
  addContentView: (options: ContentViewOptions) => ContentView;
  /** A native menu at the pointer. */
  showContextMenu: (items: ContextMenuItem[]) => void;
  /** A native warning, modal to the window, with cancel the default. */
  confirm: (confirmation: Confirmation) => Promise<boolean>;
}

export interface WindowFactory {
  create: (options: WindowOptions) => AppWindow;
}

export const createWindowFactory = (): WindowFactory => ({
  create: (options) => {
    const window = new BrowserWindow({
      title: options.title,
      ...options.bounds,
      minWidth: options.minimumSize.width,
      minHeight: options.minimumSize.height,
      show: false,
      titleBarStyle: options.titleBarStyle,
      // Windows and Linux show the application menu's bar only while Alt is
      // held or after it is pressed, so the content keeps its height.
      autoHideMenuBar: true,
      // Clear, so the vibrancy shows through; the shell paints the window
      // whole where there is none.
      ...(process.platform === "darwin" && {
        ...(options.vibrancy && { vibrancy: VIBRANCY }),
        visualEffectState: "active" as const,
        backgroundColor: "#00000000",
      }),
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
      webContentsId: webContents.id,
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
      setVibrancy: (vibrancy) => {
        if (process.platform === "darwin") {
          window.setVibrancy(vibrancy ? VIBRANCY : null);
        }
      },
      // The root view rather than the window's content size, which on
      // Windows changes after a hidden window is first shown with no `resize`.
      getContentAreaSize: () => {
        const { width, height } = window.contentView.getBounds();

        return { width, height };
      },
      onContentAreaResize: (listener) => {
        window.contentView.on("bounds-changed", listener);
      },
      addContentView: (contentViewOptions) =>
        addContentView(window, contentViewOptions),
      showContextMenu: (items) => {
        Menu.buildFromTemplate(items).popup({ window });
      },
      confirm: async ({ message, detail, confirmLabel, cancelLabel }) => {
        const { response } = await dialog.showMessageBox(window, {
          type: "warning",
          message,
          detail,
          buttons: [confirmLabel, cancelLabel],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });

        return response === 0;
      },
    };
  },
});
