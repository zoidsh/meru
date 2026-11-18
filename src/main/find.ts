import {
  NO_FIND,
  canGoOn,
  openBar,
  shownBar,
  transitionFind,
} from "#core/find.ts";
import type {
  FindBar,
  FindEffect,
  FindEvent,
  FoundInPage,
} from "#core/find.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { FindOptions } from "#platform/content-view.ts";

import type { Focus } from "./focus.ts";
import type { Overlays } from "./overlay.ts";

export interface FindDeps {
  pages: {
    /** The front tab while its page shows and can be searched, else `undefined`. */
    findable: () => TabKey | undefined;
    /** Whether the tab has a page, which a closed or sleeping one has not. */
    hasPage: (key: TabKey) => boolean;
    /** Searches the tab's page; `undefined` when it has none. */
    findInPage: (
      key: TabKey,
      term: string,
      options: FindOptions
    ) => number | undefined;
    stopFindInPage: (key: TabKey, keepSelection: boolean) => void;
    /** The tabs whose pages are in windows of their own. */
    windowTabs: () => TabKey[];
  };
  overlays: Pick<Overlays, "open" | "close" | "current">;
  focus: Pick<Focus, "focus">;
  /** A tab's own window, where its bar has a view of its own. */
  windows: {
    /** Focuses the bar's field, once its view is there. */
    focusBar: (key: TabKey) => void;
    /** Focuses the window's page, never the main window's. */
    focusPage: (key: TabKey) => void;
  };
}

/**
 * Find in page: each tab's bar, of which the front tab's shows, drawn in the
 * overlay's view, and the search it runs in its page. Another tab or pane
 * selected hides it, and it shows again, focus left where it is, when its
 * tab comes back; while a card or a toast holds the overlay's view it waits
 * under it. Escape or Close closes it, the tab keeping its term. A tab in
 * its own window has its bar there, opened by Find while that window has
 * focus, and closing it gives the focus back to that window's page.
 */
export const createFind = ({ pages, overlays, focus, windows }: FindDeps) => {
  const listeners = new Set<() => void>();
  let state = NO_FIND;

  const run = (effect: FindEffect) => {
    if (effect.kind === "stop") {
      pages.stopFindInPage(effect.key, effect.keepSelection);

      return;
    }

    const { key, term, findNext, forward } = effect;
    const requestId = pages.findInPage(key, term, { findNext, forward });

    if (requestId !== undefined) {
      // oxlint-disable-next-line no-use-before-define -- the page's id for what was asked
      dispatch({ kind: "requested", key, requestId });
    }
  };

  const dispatch = (event: FindEvent) => {
    const { state: next, effects } = transitionFind(state, event);
    const changed = next !== state;

    state = next;

    for (const effect of effects) {
      run(effect);
    }

    if (changed) {
      for (const listener of listeners) {
        listener();
      }
    }
  };

  /**
   * Keeps the bars with the pages and the overlay's view: forgets those of
   * tabs gone or asleep, follows the front, and shows the front's bar while
   * the view is free, or hides it.
   */
  const follow = () => {
    for (const bar of Object.values(state.bars)) {
      if (!pages.hasPage(bar.key)) {
        dispatch({ kind: "forget", key: bar.key });
      }
    }

    dispatch({ kind: "front", key: pages.findable() });

    const shown = shownBar(state);
    const open = overlays.current();

    if (shown && !open) {
      overlays.open({ kind: "find", ...shown.key }, { takeFocus: false });
    } else if (
      open?.kind === "find" &&
      (!shown || tabKey(open) !== tabKey(shown.key))
    ) {
      overlays.close();
    }
  };

  /** Opens the front tab's bar, focused, or gives its field focus back. */
  const reveal = (event: FindEvent) => {
    dispatch({ kind: "front", key: pages.findable() });
    dispatch(event);

    const shown = shownBar(state);
    const open = overlays.current();

    if (!shown) {
      return;
    }

    if (open?.kind === "find" && tabKey(open) === tabKey(shown.key)) {
      focus.focus([{ kind: "overlay" }]);
    } else {
      overlays.open({ kind: "find", ...shown.key });
    }
  };

  /** Opens the bar of the tab in its own window there, focused. */
  const revealInWindow = (key: TabKey, event: FindEvent) => {
    dispatch(event);

    if (openBar(state, key)) {
      windows.focusBar(key);
    }
  };

  return {
    /**
     * Find: opens the bar, its caret at the end of its term: the front
     * tab's, or that of the tab in its own window `key` names.
     */
    open: (key?: TabKey) => {
      if (key) {
        revealInWindow(key, { kind: "open", key });
      } else {
        reveal({ kind: "open" });
      }
    },
    /**
     * Find Next or Previous: steps while the bar is open, else opens it and
     * goes on with the tab's term.
     */
    again: (forward: boolean, key?: TabKey) => {
      if (key) {
        revealInWindow(key, { kind: "again", forward, key });
      } else {
        reveal({ kind: "again", forward });
      }
    },
    /** The field's term, searched for as it is typed. */
    type: (term: string, key?: TabKey) => {
      dispatch({ kind: "type", term, ...(key && { key }) });
    },
    /** Enter, Shift+Enter or the bar's buttons. */
    step: (forward: boolean, key?: TabKey) => {
      dispatch({ kind: "step", forward, ...(key && { key }) });
    },
    /** Escape or Close: ends the search and the bar, focus back on the page. */
    close: (key?: TabKey) => {
      if (key) {
        const wasOpen = openBar(state, key) !== undefined;

        dispatch({ kind: "close", key });

        if (wasOpen) {
          windows.focusPage(key);
        }

        return;
      }

      dispatch({ kind: "close" });

      if (overlays.current()?.kind === "find") {
        overlays.close();
      }
    },
    found: (key: TabKey, result: FoundInPage) => {
      dispatch({ kind: "found", key, result });
    },
    /** A tab's main frame went elsewhere, within its document or to a new one. */
    navigated: (key: TabKey, inPage: boolean) => {
      dispatch({ kind: "navigated", key, inPage });
    },
    /** A tab's page stopped loading, a frame of it or a new document. */
    loaded: (key: TabKey) => {
      dispatch({ kind: "loaded", key });
    },
    /** A tab's page moved to its own window or back, where it has no bar yet. */
    moved: (key: TabKey) => {
      dispatch({ kind: "moved", key });
    },
    /** Told when the overlays or the pages change. */
    follow,
    /** The bar that shows, the front tab's while it is open. */
    current: () => shownBar(state),
    /** The open bar of each tab in its own window, by its key. */
    windowBars: (): FindBar[] =>
      pages.windowTabs().flatMap((key) => openBar(state, key) ?? []),
    /**
     * Whether Find Next and Previous have a term to go on with, on the
     * front tab or the tab in its own window `key` names.
     */
    canGoOn: (key?: TabKey) => canGoOn(state, key ?? state.front),
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type Find = ReturnType<typeof createFind>;
