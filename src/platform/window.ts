import { BrowserWindow, Menu, dialog, nativeImage } from "electron";
import type { WebContents } from "electron";

import { isSameSite } from "#core/app-url.ts";
import type { Bitmap } from "#core/badge-image.ts";

import { baseWindowOptions, plainWindow } from "./base-window.ts";
import type { BaseWindowOptions, PlainWindow } from "./base-window.ts";
import { addContentView } from "./content-view.ts";
import type { ContentView, ContentViewOptions } from "./content-view.ts";
import { adoptOverlayView } from "./overlay-view.ts";
import type { OverlayView } from "./overlay-view.ts";

export interface WindowOptions extends BaseWindowOptions {
  preloadPath: string;
  /** The window may navigate only within this URL's scheme and host. */
  contentUrl: string;
  /**
   * Whether the page is opening one of its own documents, which becomes a
   * view of the window's, hidden until shown; every other open is refused.
   */
  isShellDocument: (request: { url: string; frameName: string }) => boolean;
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

/** The main window, the shell's page and the views put in it. */
export interface AppWindow extends PlainWindow {
  readonly webContentsId: number;
  loadURL: (url: string) => Promise<void>;
  once: (event: WindowLoadEvent, listener: () => void) => void;
  on: (event: WindowFocusEvent, listener: () => void) => void;
  /**
   * Gives the page keyboard focus. Electron brings the window forward and
   * activates the app with it on macOS and Linux, so only once it is focused.
   */
  focusPage: () => void;
  /** Told when the page gains keyboard focus. */
  onPageFocus: (listener: () => void) => void;
  /**
   * Told of each view of a document of its own the page opens, by the name
   * the page opened it under; one opened again under a name replaces the
   * last, which is closed.
   */
  onShellDocument: (
    listener: (view: OverlayView, frameName: string) => void
  ) => void;
  /** Told when the page's document goes, loaded anew or its process gone. */
  onPageGone: (listener: () => void) => void;
  isFullScreen: () => boolean;
  /** Leaves full screen, then runs `then` once the window has. */
  leaveFullScreen: (then: () => void) => void;
  /**
   * Windows alone: a small image over the taskbar button, one bitmap for
   * each scale; nothing takes it away.
   */
  setOverlayIcon: (
    images: readonly Bitmap[] | undefined,
    description: string
  ) => void;
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
      ...baseWindowOptions(options),
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

    const documentListeners = new Set<
      (view: OverlayView, frameName: string) => void
    >();
    const documents = new Map<string, OverlayView>();

    const pageGoneListeners = new Set<() => void>();
    const closeDocument = (frameName: string) => {
      documents.get(frameName)?.close();
      documents.delete(frameName);
    };
    const pageGone = () => {
      for (const frameName of documents.keys()) {
        closeDocument(frameName);
      }

      for (const listener of pageGoneListeners) {
        listener();
      }
    };

    // A document belongs to the page that opened it. Left open, a
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
      options.isShellDocument(request)
        ? {
            action: "allow",
            createWindow: (created) => {
              const { webContents: opened } = created as {
                webContents: WebContents;
              };

              const { frameName } = request;

              closeDocument(frameName);

              const adopted = adoptOverlayView(window, opened);

              documents.set(frameName, adopted);
              adopted.onGone(() => {
                if (documents.get(frameName) === adopted) {
                  documents.delete(frameName);
                }
              });

              for (const listener of documentListeners) {
                listener(adopted, frameName);
              }

              return opened;
            },
          }
        : { action: "deny" }
    );

    return {
      ...plainWindow(window),
      webContentsId: webContents.id,
      loadURL: (url) => window.loadURL(url),
      once: (event, listener) => {
        if (event === "ready-to-show") {
          window.once("ready-to-show", listener);
        } else {
          webContents.once("did-finish-load", listener);
        }
      },
      on: (event, listener) => {
        window.on(event as "focus", listener);
      },
      focusPage: () => webContents.focus(),
      onPageFocus: (listener) => {
        webContents.on("focus", listener);
      },
      onShellDocument: (listener) => {
        documentListeners.add(listener);
      },
      onPageGone: (listener) => {
        pageGoneListeners.add(listener);
      },
      isFullScreen: () => window.isFullScreen(),
      leaveFullScreen: (then) => {
        window.once("leave-full-screen", then);
        window.setFullScreen(false);
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
