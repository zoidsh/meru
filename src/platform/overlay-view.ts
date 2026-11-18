import { WebContentsView } from "electron";
import type { BaseWindow, WebContents } from "electron";

import type { KeyInput } from "#core/accelerator.ts";
import type { Rectangle } from "#core/window-bounds.ts";

import { hostWindow } from "./view-host.ts";
import type { ViewHost } from "./view-host.ts";

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
  /**
   * Puts it in another window, shown beneath every view there, as a tab's
   * own window's titlebar is drawn behind its page.
   */
  moveUnder: (host: ViewHost) => void;
  /**
   * Puts it in another window, shown above every view there, as a tab's
   * own window's find bar is drawn over its page.
   */
  moveOver: (host: ViewHost) => void;
  focus: () => void;
  /** Told when its page gains keyboard focus. */
  onFocus: (listener: () => void) => void;
  /**
   * Hears each key before the page does; one it says it handled goes no
   * further, to the page or to the application menu.
   */
  onKey: (listener: (input: KeyInput) => boolean) => void;
  /** Told once, when its page is closed or destroyed. */
  onGone: (listener: () => void) => void;
  /** Closes its page and takes it off the window. */
  close: () => void;
}

/**
 * Takes the web contents Electron made for the shell's `window.open` into a
 * view of its own on `window`, hidden until shown. Its page may go nowhere
 * and open nothing.
 */
export const adoptOverlayView = (
  window: BaseWindow,
  webContents: WebContents
): OverlayView => {
  const view = new WebContentsView({ webContents });

  view.setBackgroundColor("#00000000");
  view.setVisible(false);
  window.contentView.addChildView(view);

  let owner = window;

  webContents.on("will-navigate", (event) => {
    if (event.url !== "about:blank") {
      event.preventDefault();
    }
  });
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const goneListeners = new Set<() => void>();
  let gone = false;

  const markGone = () => {
    if (gone) {
      return;
    }

    gone = true;

    if (!owner.isDestroyed()) {
      owner.contentView.removeChildView(view);
    }

    for (const listener of goneListeners) {
      listener();
    }
  };

  webContents.once("destroyed", markGone);

  const moveTo = (host: ViewHost, under: boolean) => {
    const next = hostWindow(host);

    if (!next || gone) {
      return;
    }

    if (next !== owner && !owner.isDestroyed()) {
      owner.contentView.removeChildView(view);
    }

    owner = next;

    if (under) {
      owner.contentView.addChildView(view, 0);
    } else {
      owner.contentView.addChildView(view);
    }

    view.setVisible(true);
  };

  return {
    webContentsId: webContents.id,
    setBounds: (bounds) => view.setBounds(bounds),
    show: () => {
      // Adding a child view again moves it to the top.
      owner.contentView.addChildView(view);
      view.setVisible(true);
    },
    hide: () => view.setVisible(false),
    moveUnder: (host) => {
      moveTo(host, true);
    },
    moveOver: (host) => {
      moveTo(host, false);
    },
    focus: () => webContents.focus(),
    onFocus: (listener) => {
      webContents.on("focus", listener);
    },
    onKey: (listener) => {
      webContents.on("before-input-event", (event, input) => {
        if (listener(input)) {
          event.preventDefault();
        }
      });
    },
    onGone: (listener) => {
      goneListeners.add(listener);
    },
    close: () => {
      markGone();

      if (!webContents.isDestroyed()) {
        webContents.close();
      }
    },
  };
};
