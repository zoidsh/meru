import { findApp } from "#core/apps.ts";
import type { App } from "#core/apps.ts";
import { findRectangle } from "#core/find.ts";
import { ownWindowPageBounds } from "#core/own-window.ts";
import { inOwnWindow, ownWindowBounds } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { findTab, tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { Rectangle } from "#core/window-bounds.ts";
import type { Displays } from "#platform/displays.ts";
import type { OverlayView } from "#platform/overlay-view.ts";
import type { OwnWindow, OwnWindowFactory } from "#platform/own-window.ts";
import type { ViewHost } from "#platform/view-host.ts";

import { keepBounds, openingOptions, revealWindow } from "./windows.ts";

export interface OwnWindowsDeps {
  windows: OwnWindowFactory;
  displays: Displays;
  /** The registry, or the suite's stand-ins for it, which name a page with no title. */
  apps: readonly App[];
  state: () => State;
  isMacOS: boolean;
  /** Reveals a window without activating the app or taking focus. */
  background: boolean;
  /** The shell grey as the theme has it now. */
  backgroundColor: () => string;
  /** Closes the tab, as closing its window does, as Close Tab would. */
  closeTab: (key: TabKey) => Promise<unknown>;
  saveBounds: (key: TabKey, bounds: Rectangle) => Promise<unknown>;
  /** Told when a tab's own window becomes the one keys go to. */
  onFocus: (key: TabKey) => void;
  log: (message: string) => void;
}

/** Where a tab's own window puts its page. */
export interface OwnWindowPlace {
  host: ViewHost;
  pageBounds: () => Rectangle;
}

const DEFAULT_SIZE = { width: 1000, height: 700 };

const MINIMUM_SIZE = { width: 480, height: 320 };

interface Entry {
  key: TabKey;
  window: OwnWindow;
  titlebar: OverlayView | undefined;
  /** The find bar's view, over the page while the bar is open. */
  find: OverlayView | undefined;
  /** The view of its card, Downloads or another, over the page while one is open there. */
  card: OverlayView | undefined;
  saveBounds: ReturnType<typeof keepBounds>;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * The windows of the tabs moved to windows of their own, one each, which
 * the tabs' views are put in: opened where the tab's window last was,
 * without focus, kept where it is moved, and closed once the tab is back in
 * the main window. Closing one by its control closes its tab, as Close Tab
 * does; only Move to Main Window puts a tab back;
 * quitting, or the session ending, closes them and keeps the tabs where they
 * are, to open again at the next launch. Each window's titlebar is a
 * document of the shell's, put behind the page.
 */
export const createOwnWindows = ({
  windows,
  displays,
  apps,
  state,
  isMacOS,
  background,
  backgroundColor,
  closeTab,
  saveBounds,
  onFocus,
  log,
}: OwnWindowsDeps) => {
  const entries = new Map<string, Entry>();
  const resizeListeners = new Set<(key: TabKey) => void>();
  const blurListeners = new Set<(key: TabKey) => void>();
  const closedListeners = new Set<(key: TabKey) => void>();
  const saving = new Set<Promise<unknown>>();
  let quitting = false;

  const titleOf = (key: TabKey) => {
    const tab = findTab(state(), key);

    return tab?.title || (tab && findApp(apps, tab.app)?.name) || "";
  };

  /** Places the window's documents as its size has it now. */
  const placeDocuments = (entry: Entry) => {
    const size = entry.window.getContentAreaSize();

    entry.titlebar?.setBounds({ x: 0, y: 0, ...size });
    entry.find?.setBounds(findRectangle(ownWindowPageBounds(size), undefined));
    // Over the whole page, as the main window's overlay covers its pages,
    // so a press beside the card closes it rather than reaching the page.
    entry.card?.setBounds(ownWindowPageBounds(size));
  };

  /**
   * Puts a document of the shell's over the window's page, in place of the
   * one in `slot` before; one for a window that is not open is closed.
   */
  const adoptOver = (key: TabKey, view: OverlayView, slot: "find" | "card") => {
    const entry = entries.get(tabKey(key));

    if (!entry) {
      view.close();

      return;
    }

    if (entry[slot] !== view) {
      entry[slot]?.close();
    }

    entry[slot] = view;
    view.onGone(() => {
      if (entry[slot] === view) {
        entry[slot] = undefined;
      }
    });
    view.moveOver(entry.window.host);
    placeDocuments(entry);
  };

  const save = (key: TabKey, bounds: Rectangle) => {
    const saved = (async () => {
      try {
        await saveBounds(key, bounds);
      } catch (error) {
        log(`Where a tab's own window is was not saved: ${describe(error)}`);
      }
    })();

    saving.add(saved);
    void (async () => {
      await saved;
      saving.delete(saved);
    })();
  };

  const close = (key: TabKey) => {
    const entry = entries.get(tabKey(key));

    if (!entry) {
      return;
    }

    entries.delete(tabKey(key));
    entry.saveBounds.flush();
    entry.titlebar?.close();
    entry.find?.close();
    entry.card?.close();
    entry.window.destroy();

    for (const listener of closedListeners) {
      listener(key);
    }
  };

  /**
   * From now on closing a window leaves its tab where it is, and where each
   * window is gets saved now.
   */
  const markQuitting = () => {
    quitting = true;

    for (const entry of entries.values()) {
      entry.saveBounds.flush();
    }
  };

  const closeWithTab = async (key: TabKey) => {
    try {
      await closeTab(key);
    } catch (error) {
      log(`A tab in its own window did not close: ${describe(error)}`);
    }

    // Closing the tab closes the window; should it not have, a close still does.
    const current = findTab(state(), key);

    if (!current || !inOwnWindow(current)) {
      close(key);
    }
  };

  const create = (key: TabKey): Entry => {
    const tab = findTab(state(), key);
    const window = windows.create(
      openingOptions({
        displays,
        saved: tab && ownWindowBounds(tab),
        defaultSize: DEFAULT_SIZE,
        minimumSize: MINIMUM_SIZE,
        title: titleOf(key),
        isMacOS,
        backgroundColor: backgroundColor(),
      })
    );
    const entry: Entry = {
      key,
      window,
      titlebar: undefined,
      find: undefined,
      card: undefined,
      saveBounds: keepBounds(window, (bounds) => {
        save(key, bounds);
      }),
    };

    window.onContentAreaResize(() => {
      placeDocuments(entry);

      for (const listener of resizeListeners) {
        listener(key);
      }
    });
    window.onFocus(() => {
      onFocus(key);
    });
    window.onBlur(() => {
      for (const listener of blurListeners) {
        listener(key);
      }
    });
    window.onClose((event) => {
      if (quitting) {
        return;
      }

      event.preventDefault();
      entry.saveBounds.flush();
      void closeWithTab(key);
    });
    // A shutdown or sign-out waits on every window that will not close.
    window.onSessionEnd(markQuitting);
    // Never focused as it opens, which a profile's windows do as it is first
    // selected; Move to New Window and a click on the tab reveal it.
    window.showInactive();

    return entry;
  };

  return {
    /** The tab's own window, opened if it is not open yet. */
    open: (key: TabKey): OwnWindowPlace => {
      const existing = entries.get(tabKey(key));
      const entry = existing ?? create(key);

      if (!existing) {
        entries.set(tabKey(key), entry);
      }

      return {
        host: entry.window.host,
        pageBounds: () =>
          ownWindowPageBounds(entry.window.getContentAreaSize()),
      };
    },
    close,
    /** Whether the tab's own window is open. */
    isOpen: (key: TabKey) => entries.has(tabKey(key)),
    /**
     * Brings the tab's own window forward, as Move to New Window and
     * clicking its tab do; in the background it is only shown, never
     * focused.
     */
    reveal: (key: TabKey) => {
      const window = entries.get(tabKey(key))?.window;

      if (window) {
        revealWindow(window, background);
      }
    },
    /**
     * Puts the shell's titlebar document for the tab's window behind its
     * page, in place of one the shell opened before; one for a window that
     * is not open is closed.
     */
    adoptTitlebar: (key: TabKey, view: OverlayView) => {
      const entry = entries.get(tabKey(key));

      if (!entry) {
        view.close();

        return;
      }

      if (entry.titlebar !== view) {
        entry.titlebar?.close();
      }

      entry.titlebar = view;
      view.onGone(() => {
        if (entry.titlebar === view) {
          entry.titlebar = undefined;
        }
      });
      view.moveUnder(entry.window.host);
      placeDocuments(entry);
    },
    /**
     * Puts the shell's find bar document for the tab's window over its
     * page, at the page's top right; one for a window that is not open is
     * closed. It goes as the shell closes it. Focus is the caller's, as
     * the focus module's rules allow.
     */
    adoptFind: (key: TabKey, view: OverlayView) => {
      adoptOver(key, view, "find");
    },
    /**
     * Puts the shell's card document for the tab's window over its
     * whole page; one for a window that is not open is closed. It goes as
     * the shell closes it. Focus is the caller's.
     */
    adoptCard: (key: TabKey, view: OverlayView) => {
      adoptOver(key, view, "card");
    },
    /** What focuses the tab's window's find bar, while it is there. */
    findFocuser: (key: TabKey) => entries.get(tabKey(key))?.find?.focus,
    /** What focuses the tab's window's card, while one is there. */
    cardFocuser: (key: TabKey) => entries.get(tabKey(key))?.card?.focus,
    /** The web contents of the tab's window's card, while one is there. */
    cardContentsId: (key: TabKey) =>
      entries.get(tabKey(key))?.card?.webContentsId,
    /** The tab's window, while it is open, for whether it holds the keys. */
    window: (key: TabKey) => entries.get(tabKey(key))?.window,
    /** Titles each window after its page, as its tab is. */
    retitle: () => {
      for (const entry of entries.values()) {
        entry.window.setTitle(titleOf(entry.key));
      }
    },
    /** Paints each window in the shell grey as the theme has it now. */
    recolor: () => {
      for (const entry of entries.values()) {
        entry.window.setBackgroundColor(backgroundColor());
      }
    },
    /** Told when a window's content area changes size, which its page follows. */
    onResize: (listener: (key: TabKey) => void) => {
      resizeListeners.add(listener);
    },
    /** Told when keys stop going to a tab's window. */
    onBlur: (listener: (key: TabKey) => void) => {
      blurListeners.add(listener);
    },
    /** Told when a tab's window closes, its tab back in the main window or gone. */
    onClosed: (listener: (key: TabKey) => void) => {
      closedListeners.add(listener);
    },
    markQuitting,
    /** Settles once every save of where a window is has, for a quit to wait on. */
    saved: async () => {
      await Promise.allSettled(saving);
    },
  };
};

export type OwnWindows = ReturnType<typeof createOwnWindows>;
