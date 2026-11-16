import { BrowserWindow, Menu, dialog } from "electron";
import type { WebContents } from "electron";

import { isSameSite } from "#core/app-url.ts";
import type { Rectangle, Size } from "#core/window-bounds.ts";

import { addContentView } from "./content-view.ts";
import type { ContentView, ContentViewOptions } from "./content-view.ts";
import { adoptOverlayView } from "./overlay-view.ts";
import type { OverlayView } from "./overlay-view.ts";

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
  /**
   * Whether the page may open the window it asks for, which becomes an
   * overlay view; every other open is refused.
   */
  allowsWindowOpen: (request: { url: string; frameName: string }) => boolean;
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

/** The window becoming the one keys go to, or no longer, or shown. */
export type WindowFocusEvent = "focus" | "blur" | "show";

export interface AppWindow {
  readonly webContentsId: number;
  loadURL: (url: string) => Promise<void>;
  once: (event: WindowLoadEvent, listener: () => void) => void;
  show: () => void;
  showInactive: () => void;
  focus: () => void;
  /** Whether keys go to this window, which an inactive app never is. */
  isFocused: () => boolean;
  isVisible: () => boolean;
  on: (event: WindowFocusEvent, listener: () => void) => void;
  /**
   * Gives the page keyboard focus. Electron brings the window forward and
   * activates the app with it on macOS and Linux, so only once it is focused.
   */
  focusPage: () => void;
  /** Told when the page gains keyboard focus. */
  onPageFocus: (listener: () => void) => void;
  /** Told of each mouse button pressed in the page, before the page hears it. */
  onPageMouseDown: (listener: () => void) => void;
  /** Told of each overlay view the page opens, as `allowsWindowOpen` lets it. */
  onOverlay: (listener: (overlay: OverlayView) => void) => void;
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

    const overlayListeners = new Set<(overlay: OverlayView) => void>();
    let overlay: OverlayView | undefined;

    const closeOverlay = () => {
      overlay?.close();
      overlay = undefined;
    };

    // The overlay's document belongs to the page that opened it. Left open,
    // a reloaded page opening it again by name would get the old one,
    // navigated to a new blank document as it draws into it.
    webContents.on("did-start-navigation", (details) => {
      if (details.isMainFrame && !details.isSameDocument) {
        closeOverlay();
      }
    });

    webContents.setWindowOpenHandler(({ url, frameName }) =>
      options.allowsWindowOpen({ url, frameName })
        ? {
            action: "allow",
            createWindow: (created) => {
              const { webContents: opened } = created as {
                webContents: WebContents;
              };

              closeOverlay();
              overlay = adoptOverlayView(window, opened);

              for (const listener of overlayListeners) {
                listener(overlay);
              }

              return opened;
            },
          }
        : { action: "deny" }
    );

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
      isFocused: () => window.isFocused(),
      isVisible: () => window.isVisible(),
      on: (event, listener) => {
        window.on(event as "focus", listener);
      },
      focusPage: () => webContents.focus(),
      onPageFocus: (listener) => {
        webContents.on("focus", listener);
      },
      onPageMouseDown: (listener) => {
        webContents.on("before-mouse-event", (_event, mouse) => {
          if (mouse.type === "mouseDown") {
            listener();
          }
        });
      },
      onOverlay: (listener) => {
        overlayListeners.add(listener);
      },
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
