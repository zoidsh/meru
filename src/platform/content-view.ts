import { BrowserWindow, WebContentsView } from "electron";
import type { BaseWindow, WebContents } from "electron";

import type { KeyInput } from "#core/accelerator.ts";
import type { FoundInPage } from "#core/find.ts";
import type { Rectangle } from "#core/window-bounds.ts";

import { hostWindow } from "./view-host.ts";
import type { ViewHost } from "./view-host.ts";
import { zoomContents } from "./zoom.ts";
import type { ZoomChange } from "./zoom.ts";

/** What the view's page did, as Meru tracks it. */
export type ContentViewEvent =
  /** The main frame finished loading; an error page's finish follows a failure. */
  | { kind: "loaded" }
  /** Any load, the first or a later one, started or stopped. */
  | { kind: "load-started" }
  | { kind: "load-stopped" }
  | { kind: "failed-to-load"; code: number; name: string }
  | { kind: "crashed"; reason: string }
  /** The main frame went to `url`, within its document or to a new one. */
  | { kind: "navigated"; url: string; inPage?: boolean }
  | { kind: "titled"; title: string };

// The page cancelling a load it started itself, which is no failure.
const ERR_ABORTED = -3;

export interface ContentViewOptions {
  /** The session's partition, which the page and every window it opens share. */
  partition: string;
  /** A preload for the view's own documents. */
  preload?: string;
  /**
   * The preload of a window the page, or a window it opened, opens at `url`,
   * if any: Electron gives a child only the security preferences it inherits
   * and the options its open handler names, so none of the view's own.
   */
  childPreload?: (url: string) => string | undefined;
  /**
   * Answers each window the page asks to open, and each one a window it opened
   * asks for in turn. An allowed one opens in the session as a window of its
   * own, never attached to the view's, so hiding that leaves it; it closes
   * with the view. One answered with a download is downloaded by the page
   * that asked, and opens nothing.
   */
  onWindowOpen: (
    url: string,
    asked?: { inBackground: boolean }
  ) => WindowOpenAnswer;
  /**
   * Answers each place a window the page opened is about to go, its first
   * load and redirects included; a refused one stays where it was.
   */
  onChildNavigation: (url: string) => "allow" | "deny";
  /** Child windows show without activating the app, as the shell window does. */
  background: boolean;
  /**
   * Told of the view's webContents and of each child window's as it is
   * created, a window with the URL it was opened for; what it returns is
   * called when that webContents is destroyed.
   */
  onWebContents: (
    webContentsId: number,
    kind: "content-view" | "child-window",
    openedAt?: string
  ) => () => void;
  /** Told of the view's own page, never of its child windows'. */
  onEvent: (event: ContentViewEvent) => void;
  /**
   * Hears each key before the page does; one it says it handled goes no
   * further, to the page or to the application menu.
   */
  onKey: (input: KeyInput) => boolean;
  /**
   * Told when the page gains keyboard focus, for any reason: a page can take
   * it as it first loads.
   */
  onFocus: () => void;
  /** Told when the person presses on the page, by mouse or by touch. */
  onPointerDown: () => void;
  /**
   * Told of each answer to a search `find` asked; an earlier search's can
   * come late, or never once a later one is asked.
   */
  onFound: (result: FoundInPage) => void;
}

export type WindowOpenAnswer = "allow" | "deny" | "download";

export interface FindOptions {
  /** Starts a new search; without it, steps to the next or previous match. */
  findNext: boolean;
  forward: boolean;
}

/** Where the page can go in its history, and whether it is loading now. */
export interface Navigation {
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

export interface ContentView {
  setBounds: (bounds: Rectangle) => void;
  /** Rounds all four corners, clipping the page. */
  setBorderRadius: (radius: number) => void;
  /** Rejects when the load does not commit. */
  loadURL: (url: string) => Promise<void>;
  /** Loads the page it shows again. */
  reload: () => void;
  /** Each does nothing where the history has no page that way. */
  goBack: () => void;
  goForward: () => void;
  /** Stops the load in progress, if any. */
  stop: () => void;
  navigation: () => Navigation;
  /** Where the main frame is now. */
  url: () => string;
  /** Whether the page is playing sound now. */
  audible: () => boolean;
  /**
   * Runs an expression in the page's own world and answers its value. The
   * page owns that world, so the expression is a constant, never built from
   * anything, and what it answers is checked as the page's word.
   */
  evaluate: (expression: string) => Promise<unknown>;
  /** Hidden, the page stays loaded. */
  setVisible: (visible: boolean) => void;
  /**
   * Gives the page keyboard focus. Electron brings the window forward and
   * activates the app with it on macOS and Linux, so only once it is focused.
   */
  focus: () => void;
  /**
   * Searches the page for `term`, highlighting each match and scrolling to
   * the active one, and answers the id `onFound` gives its answer.
   */
  findInPage: (term: string, options: FindOptions) => number;
  /**
   * Ends the search and clears its highlights; `keepSelection` leaves the
   * active match selected in the page.
   */
  stopFindInPage: (keepSelection: boolean) => void;
  zoom: (change: ZoomChange) => void;
  /**
   * Puts the view in another window with its page as it is, loading nothing;
   * it closes with that window from then on.
   */
  moveTo: (host: ViewHost) => void;
  /** Closes the page and every window it opened, and takes it off the window. */
  close: () => void;
}

const trackDestroyed = (
  webContents: WebContents,
  kind: "content-view" | "child-window",
  onWebContents: ContentViewOptions["onWebContents"],
  openedAt?: string
) => {
  webContents.once("destroyed", onWebContents(webContents.id, kind, openedAt));
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

/**
 * A window refused before its first page committed would stay open and
 * blank, so it is closed instead.
 */
const guardNavigation = (
  child: BrowserWindow,
  onChildNavigation: ContentViewOptions["onChildNavigation"]
) => {
  const { webContents } = child;
  const refuse = (event: Electron.Event) => {
    event.preventDefault();

    if (webContents.getURL() === "") {
      setImmediate(() => {
        if (!child.isDestroyed()) {
          child.destroy();
        }
      });
    }
  };

  webContents.on("will-navigate", (event) => {
    if (onChildNavigation(event.url) === "deny") {
      refuse(event);
    }
  });
  webContents.on("will-redirect", (event) => {
    if (event.isMainFrame && onChildNavigation(event.url) === "deny") {
      refuse(event);
    }
  });
};

const routeWindowOpens = (
  webContents: WebContents,
  options: Pick<
    ContentViewOptions,
    | "onWindowOpen"
    | "onChildNavigation"
    | "background"
    | "onWebContents"
    | "childPreload"
  >,
  children: Set<BrowserWindow>
) => {
  const {
    onWindowOpen,
    onChildNavigation,
    background,
    onWebContents,
    childPreload,
  } = options;

  webContents.setWindowOpenHandler(({ url, disposition }) => {
    const answer = onWindowOpen(url, {
      inBackground: disposition === "background-tab",
    });

    if (answer === "download") {
      webContents.downloadURL(url);
    }

    if (answer !== "allow") {
      return { action: "deny" };
    }

    const preload = childPreload?.(url);

    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        show: !background,
        // Merged over what the child inherits, which keeps the sandbox.
        ...(preload !== undefined && { webPreferences: { preload } }),
      },
    };
  });
  webContents.on("did-create-window", (child, { url }) => {
    children.add(child);
    child.once("closed", () => children.delete(child));
    trackDestroyed(child.webContents, "child-window", onWebContents, url);
    guardNavigation(child, onChildNavigation);
    // Windows and Linux would give it the app's menu, whose commands act on
    // the main window.
    child.removeMenu();

    if (background) {
      showInactiveOnceReady(child);
    }

    routeWindowOpens(child.webContents, options, children);
  });
};

export type SessionWindowOptions = Pick<
  ContentViewOptions,
  | "partition"
  | "preload"
  | "childPreload"
  | "onWindowOpen"
  | "onChildNavigation"
  | "background"
  | "onWebContents"
> & {
  url: string;
  /** Told once it has closed, by the page's own `window.close()` or `close`. */
  onClosed: () => void;
};

export interface SessionWindow {
  /** Closes it and every window it opened. */
  close: () => void;
}

const SESSION_WINDOW_SIZE = { width: 800, height: 600 };

/**
 * A window of its own in a profile's session, opened by Meru rather than a
 * page, for a page that needs no tab: the kind a page's pop-out gets, with no
 * menu, its own pop-ups and navigations answered as a view's windows' are. Shown and focused, since the person asked for it, unless
 * the background flags hold it back.
 */
export const openSessionWindow = (
  options: SessionWindowOptions
): SessionWindow => {
  const { partition, preload, background, url, onWebContents, onClosed } =
    options;
  const children = new Set<BrowserWindow>();
  const window = new BrowserWindow({
    ...SESSION_WINDOW_SIZE,
    show: !background,
    webPreferences: {
      partition,
      ...(preload !== undefined && { preload }),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  trackDestroyed(window.webContents, "child-window", onWebContents, url);
  guardNavigation(window, options.onChildNavigation);
  window.removeMenu();

  if (background) {
    showInactiveOnceReady(window);
  }

  routeWindowOpens(window.webContents, options, children);

  const closeChildren = () => {
    for (const child of children) {
      if (!child.isDestroyed()) {
        child.destroy();
      }
    }
  };

  window.once("closed", () => {
    closeChildren();
    onClosed();
  });
  void window.loadURL(url).catch(() => {
    // A failed load shows Chromium's error page in the window.
  });

  return {
    close: () => {
      closeChildren();

      if (!window.isDestroyed()) {
        window.destroy();
      }
    },
  };
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
    onEvent({ kind: "load-started" });
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

    onEvent({ kind: "load-stopped" });
  });
  webContents.on("render-process-gone", (_event, { reason }) =>
    onEvent({ kind: "crashed", reason })
  );
  webContents.on("did-navigate", (_event, url) =>
    onEvent({ kind: "navigated", url, inPage: false })
  );
  webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (isMainFrame) {
      onEvent({ kind: "navigated", url, inPage: true });
    }
  });
  webContents.on("page-title-updated", (_event, title) =>
    onEvent({ kind: "titled", title })
  );
};

/**
 * A sandboxed, context-isolated view for a page Meru does not own, attached to
 * `window`.
 */
export const addContentView = (
  window: BaseWindow,
  options: ContentViewOptions
): ContentView => {
  const { partition, preload, onWebContents } = options;
  const children = new Set<BrowserWindow>();
  const view = new WebContentsView({
    webPreferences: {
      partition,
      ...(preload !== undefined && { preload }),
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
  webContents.on("focus", options.onFocus);
  webContents.on("input-event", (_event, input) => {
    if (input.type === "mouseDown" || input.type === "gestureTapDown") {
      options.onPointerDown();
    }
  });
  webContents.on("found-in-page", (_event, result) => {
    options.onFound({
      requestId: result.requestId,
      ordinal: result.activeMatchOrdinal,
      matches: result.matches,
    });
  });
  reportEvents(webContents, options.onEvent);
  routeWindowOpens(webContents, options, children);
  window.contentView.addChildView(view);

  let owner = window;

  const close = () => {
    owner.off("closed", close);

    for (const child of children) {
      if (!child.isDestroyed()) {
        child.destroy();
      }
    }

    if (!owner.isDestroyed()) {
      owner.contentView.removeChildView(view);
    }

    if (!webContents.isDestroyed()) {
      webContents.close();
    }
  };

  // Closing a window leaves the views in it alive.
  owner.once("closed", close);

  return {
    setBounds: (bounds) => view.setBounds(bounds),
    setBorderRadius: (radius) => view.setBorderRadius(radius),
    loadURL: (url) => webContents.loadURL(url),
    reload: () => webContents.reload(),
    goBack: () => {
      if (webContents.navigationHistory.canGoBack()) {
        webContents.navigationHistory.goBack();
      }
    },
    goForward: () => {
      if (webContents.navigationHistory.canGoForward()) {
        webContents.navigationHistory.goForward();
      }
    },
    stop: () => webContents.stop(),
    navigation: () => ({
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward(),
      loading: webContents.isLoading(),
    }),
    url: () => webContents.getURL(),
    audible: () => webContents.isCurrentlyAudible(),
    evaluate: (expression) => webContents.executeJavaScript(expression),
    setVisible: (visible) => view.setVisible(visible),
    focus: () => webContents.focus(),
    findInPage: (term, { findNext, forward }) =>
      webContents.findInPage(term, { findNext, forward }),
    stopFindInPage: (keepSelection) => {
      webContents.stopFindInPage(
        keepSelection ? "keepSelection" : "clearSelection"
      );
    },
    zoom: (change) => {
      zoomContents(webContents, change);
    },
    moveTo: (host) => {
      const next = hostWindow(host);

      if (!next || next === owner) {
        return;
      }

      owner.off("closed", close);

      if (!owner.isDestroyed()) {
        owner.contentView.removeChildView(view);
      }

      owner = next;
      owner.contentView.addChildView(view);
      owner.once("closed", close);
    },
    close,
  };
};
