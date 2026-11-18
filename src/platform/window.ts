import { BrowserWindow, Menu, dialog, nativeImage } from "electron";
import type { WebContents } from "electron";

import { isSameSite } from "#core/app-url.ts";
import type { Bitmap } from "#core/badge-image.ts";
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
  /** Shown where the page has not painted, as `#rrggbb`. */
  backgroundColor: string;
  /**
   * Whether the page is opening the overlay's document, which becomes a view
   * over the content; every other open is refused.
   */
  isOverlayDocument: (request: { url: string; frameName: string }) => boolean;
}

export type ContextMenuItem =
  | {
      label: string;
      enabled: boolean;
      /** None for a line that only says something. */
      click?: () => void;
    }
  | { type: "separator" };

export interface Confirmation {
  message: string;
  detail: string;
  confirmLabel: string;
  cancelLabel: string;
}

export type WindowLoadEvent = "ready-to-show" | "did-finish-load";

/**
 * The window becoming the one keys go to, or no longer, shown or hidden, or
 * minimized or restored.
 */
export type WindowFocusEvent =
  | "focus"
  | "blur"
  | "show"
  | "hide"
  | "minimize"
  | "restore";

export interface AppWindow {
  readonly webContentsId: number;
  loadURL: (url: string) => Promise<void>;
  once: (event: WindowLoadEvent, listener: () => void) => void;
  show: () => void;
  showInactive: () => void;
  hide: () => void;
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
  /** Told of each view of the overlay's document the page opens. */
  onOverlayDocument: (listener: (view: OverlayView) => void) => void;
  /** Told when the page's document goes, loaded anew or its process gone. */
  onPageGone: (listener: () => void) => void;
  restore: () => void;
  isMinimized: () => boolean;
  isDestroyed: () => boolean;
  /** Told as the window is asked to close; `preventDefault` keeps it open. */
  onClose: (listener: (event: { preventDefault: () => void }) => void) => void;
  isFullScreen: () => boolean;
  /** Leaves full screen, then runs `then` once the window has. */
  leaveFullScreen: (then: () => void) => void;
  /** Windows alone: the session ends, for a shutdown, restart or sign-out. */
  onSessionEnd: (listener: () => void) => void;
  /**
   * Windows alone: a small image over the taskbar button, one bitmap for
   * each scale; nothing takes it away.
   */
  setOverlayIcon: (
    images: readonly Bitmap[] | undefined,
    description: string
  ) => void;
  setBackgroundColor: (color: string) => void;
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
      backgroundColor: options.backgroundColor,
      // Windows and Linux show the application menu's bar only while Alt is
      // held or after it is pressed, so the content keeps its height.
      autoHideMenuBar: true,
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

    const documentListeners = new Set<(view: OverlayView) => void>();
    let overlayDocument: OverlayView | undefined;

    const pageGoneListeners = new Set<() => void>();
    const closeDocument = () => {
      overlayDocument?.close();
      overlayDocument = undefined;
    };
    const pageGone = () => {
      closeDocument();

      for (const listener of pageGoneListeners) {
        listener();
      }
    };

    // The document belongs to the page that opened it. Left open, a
    // reloaded page opening it again by name would get the old one,
    // navigated to a new blank document as it draws into it.
    webContents.on("did-start-navigation", (details) => {
      if (details.isMainFrame && !details.isSameDocument) {
        pageGone();
      }
    });
    // It lives in the page's process, gone with it.
    webContents.on("render-process-gone", pageGone);

    webContents.setWindowOpenHandler((request) =>
      options.isOverlayDocument(request)
        ? {
            action: "allow",
            createWindow: (created) => {
              const { webContents: opened } = created as {
                webContents: WebContents;
              };

              closeDocument();
              overlayDocument = adoptOverlayView(window, opened);

              for (const listener of documentListeners) {
                listener(overlayDocument);
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
      hide: () => window.hide(),
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
      onOverlayDocument: (listener) => {
        documentListeners.add(listener);
      },
      onPageGone: (listener) => {
        pageGoneListeners.add(listener);
      },
      restore: () => window.restore(),
      isMinimized: () => window.isMinimized(),
      isDestroyed: () => window.isDestroyed(),
      onClose: (listener) => {
        window.on("close", listener);
      },
      isFullScreen: () => window.isFullScreen(),
      leaveFullScreen: (then) => {
        window.once("leave-full-screen", then);
        window.setFullScreen(false);
      },
      onSessionEnd: (listener) => {
        window.on("session-end", listener);
      },
      setOverlayIcon: (images, description) => {
        if (process.platform !== "win32") {
          return;
        }

        const [first, ...rest] = images ?? [];

        if (!first) {
          window.setOverlayIcon(null, "");

          return;
        }

        const image = nativeImage.createFromBitmap(Buffer.from(first.pixels), {
          width: first.width,
          height: first.height,
        });

        // Windows picks the representation for the display's scale, the
        // overlay being 16 logical pixels.
        for (const bitmap of rest) {
          image.addRepresentation({
            scaleFactor: bitmap.width / first.width,
            width: bitmap.width,
            height: bitmap.height,
            buffer: Buffer.from(bitmap.pixels),
          });
        }

        window.setOverlayIcon(image, description);
      },
      setBackgroundColor: (color) => {
        window.setBackgroundColor(color);
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
