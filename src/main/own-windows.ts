import { debounce } from "es-toolkit";

import { findApp } from "#core/apps.ts";
import type { App } from "#core/apps.ts";
import { ownWindowPageBounds } from "#core/own-window.ts";
import { inOwnWindow, ownWindowBounds } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { findTab, tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import { resolveWindowBounds } from "#core/window-bounds.ts";
import type { Rectangle } from "#core/window-bounds.ts";
import type { Displays } from "#platform/displays.ts";
import type { OverlayView } from "#platform/overlay-view.ts";
import type { OwnWindow, OwnWindowFactory } from "#platform/own-window.ts";
import type { ViewHost } from "#platform/view-host.ts";

export interface OwnWindowsDeps {
  windows: OwnWindowFactory;
  displays: Displays;
  /** The registry, or the suite's stand-ins for it, which name a page with no title. */
  apps: readonly App[];
  state: () => State;
  isMacOS: boolean;
  /** Opens each window without activating the app or taking focus. */
  background: boolean;
  /** The shell grey as the theme has it now. */
  backgroundColor: () => string;
  /** Puts the tab back in the main window, unselected, as closing its window does. */
  moveToMainWindow: (key: TabKey) => Promise<unknown>;
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

/** How long a move or resize rests before where the window is gets saved. */
const SAVE_BOUNDS_MS = 500;

interface Entry {
  key: TabKey;
  window: OwnWindow;
  titlebar: OverlayView | undefined;
  saveBounds: ReturnType<typeof debounce<() => void>>;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * The windows of the tabs moved to windows of their own, one each, which
 * the tabs' views are put in: opened where the tab's window last was, kept
 * where it is moved, and closed once the tab is back in the main window.
 * Closing one by its control puts the tab back, unselected; quitting closes
 * them and keeps the tabs where they are, to open again at the next launch.
 * Each window's titlebar is a document of the shell's, put behind the page.
 */
export const createOwnWindows = ({
  windows,
  displays,
  apps,
  state,
  isMacOS,
  background,
  backgroundColor,
  moveToMainWindow,
  saveBounds,
  onFocus,
  log,
}: OwnWindowsDeps) => {
  const entries = new Map<string, Entry>();
  const resizeListeners = new Set<(key: TabKey) => void>();
  let quitting = false;

  const titleOf = (key: TabKey) => {
    const tab = findTab(state(), key);

    return tab?.title || (tab && findApp(apps, tab.app)?.name) || "";
  };

  const placeTitlebar = (entry: Entry) => {
    const { width, height } = entry.window.getContentAreaSize();

    entry.titlebar?.setBounds({ x: 0, y: 0, width, height });
  };

  const save = (entry: Entry) => {
    if (entry.window.isDestroyed()) {
      return;
    }

    const bounds = entry.window.getBounds();

    void (async () => {
      try {
        await saveBounds(entry.key, bounds);
      } catch (error) {
        log(`Where a tab's own window is was not saved: ${describe(error)}`);
      }
    })();
  };

  const moveBack = async (key: TabKey) => {
    try {
      await moveToMainWindow(key);
    } catch (error) {
      log(`A tab did not move back to the main window: ${describe(error)}`);
    }
  };

  const create = (key: TabKey): Entry => {
    const tab = findTab(state(), key);
    const window = windows.create({
      title: titleOf(key),
      bounds: resolveWindowBounds({
        saved: tab && ownWindowBounds(tab),
        displays: displays.getAll(),
        defaultSize: DEFAULT_SIZE,
        minimumSize: MINIMUM_SIZE,
      }),
      minimumSize: MINIMUM_SIZE,
      titleBarStyle: isMacOS ? "hiddenInset" : "default",
      backgroundColor: backgroundColor(),
    });
    const entry: Entry = {
      key,
      window,
      titlebar: undefined,
      saveBounds: debounce(() => {
        save(entry);
      }, SAVE_BOUNDS_MS),
    };

    window.onContentAreaResize(() => {
      placeTitlebar(entry);

      for (const listener of resizeListeners) {
        listener(key);
      }
    });
    window.onBoundsChange(entry.saveBounds);
    window.onFocus(() => {
      onFocus(key);
    });
    window.onClose((event) => {
      if (quitting) {
        return;
      }

      event.preventDefault();
      entry.saveBounds.flush();

      const current = findTab(state(), key);

      if (!current || !inOwnWindow(current)) {
        // oxlint-disable-next-line no-use-before-define -- a window its tab has left closes at once
        close(key);

        return;
      }

      void moveBack(key);
    });

    if (background) {
      window.showInactive();
    } else {
      window.show();
    }

    return entry;
  };

  const close = (key: TabKey) => {
    const entry = entries.get(tabKey(key));

    if (!entry) {
      return;
    }

    entries.delete(tabKey(key));
    entry.saveBounds.flush();
    entry.titlebar?.close();
    entry.window.destroy();
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
     * Brings the tab's own window forward, as clicking its tab does; in the
     * background it is only shown, never focused.
     */
    reveal: (key: TabKey) => {
      const window = entries.get(tabKey(key))?.window;

      if (!window) {
        return;
      }

      if (window.isMinimized()) {
        window.restore();
      }

      if (background) {
        window.showInactive();
      } else {
        window.show();
        window.focus();
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
      placeTitlebar(entry);
    },
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
    /** From now on closing a window leaves its tab where it is. */
    markQuitting: () => {
      quitting = true;

      for (const entry of entries.values()) {
        entry.saveBounds.flush();
      }
    },
  };
};

export type OwnWindows = ReturnType<typeof createOwnWindows>;
