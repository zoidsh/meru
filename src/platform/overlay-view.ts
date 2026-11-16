import { WebContentsView } from "electron";
import type { BrowserWindow, WebContents } from "electron";

import type { Rectangle } from "#core/window-bounds.ts";

/**
 * The view the shell's overlay document shows in, above every content view,
 * clear where the document draws nothing. Its page is the shell's own blank
 * document, in the shell's process, which the shell draws into.
 */
export interface OverlayView {
  readonly webContentsId: number;
  setBounds: (bounds: Rectangle) => void;
  /** Above every view, including any added since it was last shown. */
  show: () => void;
  /** Hidden, since a clear view still takes every click in its bounds. */
  hide: () => void;
  focus: () => void;
  /** Told when its page gains keyboard focus. */
  onFocus: (listener: () => void) => void;
  /** Told once its page is gone. */
  onDestroyed: (listener: () => void) => void;
  /** Closes its page and takes it off the window. */
  close: () => void;
}

/**
 * Takes the web contents Electron made for the shell's `window.open` into a
 * view of its own on `window`, hidden until shown. Its page may go nowhere
 * and open nothing.
 */
export const adoptOverlayView = (
  window: BrowserWindow,
  webContents: WebContents
): OverlayView => {
  const view = new WebContentsView({ webContents });

  view.setBackgroundColor("#00000000");
  view.setVisible(false);
  window.contentView.addChildView(view);

  webContents.on("will-navigate", (event) => {
    if (event.url !== "about:blank") {
      event.preventDefault();
    }
  });
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const remove = () => {
    if (!window.isDestroyed()) {
      window.contentView.removeChildView(view);
    }
  };

  webContents.once("destroyed", remove);

  return {
    webContentsId: webContents.id,
    setBounds: (bounds) => view.setBounds(bounds),
    show: () => {
      // Adding a child view again moves it to the top.
      window.contentView.addChildView(view);
      view.setVisible(true);
    },
    hide: () => view.setVisible(false),
    focus: () => webContents.focus(),
    onFocus: (listener) => {
      webContents.on("focus", listener);
    },
    onDestroyed: (listener) => {
      webContents.once("destroyed", listener);
    },
    close: () => {
      remove();

      if (!webContents.isDestroyed()) {
        webContents.close();
      }
    },
  };
};
