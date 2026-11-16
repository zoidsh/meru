import { WebContentsView } from "electron";
import type { BrowserWindow, WebContents } from "electron";

import type { Rectangle } from "#core/window-bounds.ts";

export interface ContentViewOptions {
  /** The session's partition, which the page and every window it opens share. */
  partition: string;
  /**
   * Answers each window the page asks to open, and each one a window it opened
   * asks for in turn. An allowed one opens as a child window in the session.
   */
  onWindowOpen: (url: string) => "allow" | "deny";
}

export interface ContentView {
  setBounds: (bounds: Rectangle) => void;
  /** Rejects when the load does not commit. */
  loadURL: (url: string) => Promise<void>;
}

const routeWindowOpens = (
  webContents: WebContents,
  onWindowOpen: ContentViewOptions["onWindowOpen"]
) => {
  webContents.setWindowOpenHandler(({ url }) => ({
    action: onWindowOpen(url),
  }));
  webContents.on("did-create-window", (child) => {
    routeWindowOpens(child.webContents, onWindowOpen);
  });
};

/**
 * A sandboxed, context-isolated view with no preload, for a page Meru does not
 * own, attached to `window`.
 */
export const addContentView = (
  window: BrowserWindow,
  { partition, onWindowOpen }: ContentViewOptions
): ContentView => {
  const view = new WebContentsView({
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const { webContents } = view;

  routeWindowOpens(webContents, onWindowOpen);
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
