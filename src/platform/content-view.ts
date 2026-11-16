import { WebContentsView } from "electron";
import type { BrowserWindow, WebContents } from "electron";

import type { Rectangle } from "#core/window-bounds.ts";

export interface ContentViewOptions {
  /** The session's partition, which the page and every window it opens share. */
  partition: string;
  /**
   * Answers each window the page asks to open, and each one a window it opened
   * asks for in turn. An allowed one opens in the session as a child of the
   * view's window, so it closes with it.
   */
  onWindowOpen: (url: string) => "allow" | "deny";
  /** Child windows show without activating the app, as the shell window does. */
  background: boolean;
}

export interface ContentView {
  setBounds: (bounds: Rectangle) => void;
  /** Rejects when the load does not commit. */
  loadURL: (url: string) => Promise<void>;
}

/** Shown on whichever comes first, since Wayland can skip `ready-to-show`. */
const showInactiveOnceReady = (window: BrowserWindow) => {
  const show = () => {
    if (!window.isDestroyed() && !window.isVisible()) {
      window.showInactive();
    }
  };

  window.once("ready-to-show", show);
  window.webContents.once("did-finish-load", show);
};

const routeWindowOpens = (
  webContents: WebContents,
  parent: BrowserWindow,
  options: Pick<ContentViewOptions, "onWindowOpen" | "background">
) => {
  const { onWindowOpen, background } = options;

  webContents.setWindowOpenHandler(({ url }) =>
    onWindowOpen(url) === "allow"
      ? {
          action: "allow",
          overrideBrowserWindowOptions: { parent, show: !background },
        }
      : { action: "deny" }
  );
  webContents.on("did-create-window", (child) => {
    if (background) {
      showInactiveOnceReady(child);
    }

    routeWindowOpens(child.webContents, parent, options);
  });
};

/**
 * A sandboxed, context-isolated view with no preload, for a page Meru does not
 * own, attached to `window`.
 */
export const addContentView = (
  window: BrowserWindow,
  options: ContentViewOptions
): ContentView => {
  const { partition } = options;
  const view = new WebContentsView({
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const { webContents } = view;

  routeWindowOpens(webContents, window, options);
  window.contentView.addChildView(view);
  // Closing a window leaves the views in it alive.
  window.once("closed", () => {
    if (!webContents.isDestroyed()) {
      webContents.close();
    }
  });

  return {
    setBounds: (bounds) => view.setBounds(bounds),
    loadURL: (url) => webContents.loadURL(url),
  };
};
