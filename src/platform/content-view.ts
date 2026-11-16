import { WebContentsView } from "electron";
import type { BrowserWindow, WebContents } from "electron";

import type { KeyInput } from "#core/accelerator.ts";
import type { Rectangle } from "#core/window-bounds.ts";

/** What the view's page did, as Meru tracks it. */
export type ContentViewEvent =
  /** The main frame finished loading; an error page's finish follows a failure. */
  | { kind: "loaded" }
  | { kind: "failed-to-load"; code: number; name: string }
  | { kind: "crashed"; reason: string }
  | { kind: "navigated"; url: string }
  | { kind: "titled"; title: string };

// The page cancelling a load it started itself, which is no failure.
const ERR_ABORTED = -3;

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
  /**
   * Told of the view's webContents and of each child window's as it is
   * created; what it returns is called when that webContents is destroyed.
   */
  onWebContents: (
    webContentsId: number,
    kind: "content-view" | "child-window"
  ) => () => void;
  /** Told of the view's own page, never of its child windows'. */
  onEvent: (event: ContentViewEvent) => void;
  /**
   * Hears each key before the page does; one it says it handled goes no
   * further, to the page or to the application menu.
   */
  onKey: (input: KeyInput) => boolean;
}

export interface ContentView {
  setBounds: (bounds: Rectangle) => void;
  /** Rounds all four corners, clipping the page. */
  setBorderRadius: (radius: number) => void;
  /** Rejects when the load does not commit. */
  loadURL: (url: string) => Promise<void>;
  /** Loads the page it shows again. */
  reload: () => void;
  /** Hidden, the page stays loaded. */
  setVisible: (visible: boolean) => void;
  /** Closes the page and every window it opened, and takes it off the window. */
  close: () => void;
}

const trackDestroyed = (
  webContents: WebContents,
  kind: "content-view" | "child-window",
  onWebContents: ContentViewOptions["onWebContents"]
) => {
  webContents.once("destroyed", onWebContents(webContents.id, kind));
};

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
  options: ContentViewOptions,
  children: Set<BrowserWindow>
) => {
  const { onWindowOpen, background, onWebContents } = options;

  webContents.setWindowOpenHandler(({ url }) =>
    onWindowOpen(url) === "allow"
      ? {
          action: "allow",
          overrideBrowserWindowOptions: { parent, show: !background },
        }
      : { action: "deny" }
  );
  webContents.on("did-create-window", (child) => {
    children.add(child);
    child.once("closed", () => children.delete(child));
    trackDestroyed(child.webContents, "child-window", onWebContents);

    if (background) {
      showInactiveOnceReady(child);
    }

    routeWindowOpens(child.webContents, parent, options, children);
  });
};

const reportEvents = (
  webContents: WebContents,
  onEvent: ContentViewOptions["onEvent"]
) => {
  // Not `did-finish-load`: when a page starts a navigation of its own before
  // its load finishes, as Gmail served by its service worker does, and that
  // navigation is aborted, the page shows but `did-finish-load` never fires.
  let failed = false;

  webContents.on("did-start-loading", () => {
    failed = false;
  });
  webContents.on("did-fail-load", (_event, code, name, _url, isMainFrame) => {
    if (isMainFrame && code !== ERR_ABORTED) {
      failed = true;
      onEvent({ kind: "failed-to-load", code, name });
    }
  });
  webContents.on("did-stop-loading", () => {
    if (!failed) {
      onEvent({ kind: "loaded" });
    }
  });
  webContents.on("render-process-gone", (_event, { reason }) =>
    onEvent({ kind: "crashed", reason })
  );
  webContents.on("did-navigate", (_event, url) =>
    onEvent({ kind: "navigated", url })
  );
  webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) {
      onEvent({ kind: "navigated", url });
    }
  });
  webContents.on("page-title-updated", (_event, title) =>
    onEvent({ kind: "titled", title })
  );
};

/**
 * A sandboxed, context-isolated view with no preload, for a page Meru does not
 * own, attached to `window`.
 */
export const addContentView = (
  window: BrowserWindow,
  options: ContentViewOptions
): ContentView => {
  const { partition, onWebContents } = options;
  const children = new Set<BrowserWindow>();
  const view = new WebContentsView({
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const { webContents } = view;

  trackDestroyed(webContents, "content-view", onWebContents);
  webContents.on("before-input-event", (event, input) => {
    if (options.onKey(input)) {
      event.preventDefault();
    }
  });
  reportEvents(webContents, options.onEvent);
  routeWindowOpens(webContents, window, options, children);
  window.contentView.addChildView(view);

  const close = () => {
    window.off("closed", close);

    for (const child of children) {
      if (!child.isDestroyed()) {
        child.destroy();
      }
    }

    if (!window.isDestroyed()) {
      window.contentView.removeChildView(view);
    }

    if (!webContents.isDestroyed()) {
      webContents.close();
    }
  };

  // Closing a window leaves the views in it alive.
  window.once("closed", close);

  return {
    setBounds: (bounds) => view.setBounds(bounds),
    setBorderRadius: (radius) => view.setBorderRadius(radius),
    loadURL: (url) => webContents.loadURL(url),
    reload: () => webContents.reload(),
    setVisible: (visible) => view.setVisible(visible),
    close,
  };
};
