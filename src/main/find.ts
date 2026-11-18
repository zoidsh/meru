import { NO_FIND, transitionFind } from "#core/find.ts";
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
    /** Searches the tab's page; `undefined` when it has none. */
    findInPage: (
      key: TabKey,
      term: string,
      options: FindOptions
    ) => number | undefined;
    stopFindInPage: (key: TabKey, keepSelection: boolean) => void;
  };
  overlays: Pick<Overlays, "open" | "close" | "current">;
  focus: Pick<Focus, "focus">;
}

/**
 * Find in page: the bar over the front tab's page, drawn in the overlay's
 * view, and the search it runs there. The overlay holding the bar is what
 * keeps it open, so whatever closes that, Escape, Close, another tab or
 * pane selected or another overlay opening, ends the search; so does the
 * page going, asleep or failed.
 */
export const createFind = ({ pages, overlays, focus }: FindDeps) => {
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

  const holdsBar = (bar: FindBar) => {
    const open = overlays.current();
    const front = pages.findable();

    return (
      open?.kind === "find" &&
      tabKey(open) === tabKey(bar.key) &&
      front !== undefined &&
      tabKey(front) === tabKey(bar.key)
    );
  };

  /** Ends the search once what held the bar has gone. */
  const follow = () => {
    const { bar } = state;

    if (!bar || holdsBar(bar)) {
      return;
    }

    dispatch({ kind: "close" });

    if (overlays.current()?.kind === "find") {
      overlays.close();
    }
  };

  const show = (key: TabKey, event: FindEvent) => {
    const open = overlays.current();

    dispatch(event);

    if (open?.kind === "find" && tabKey(open) === tabKey(key)) {
      // Open already, its field takes focus back from the page.
      focus.focus([{ kind: "overlay" }]);
    } else {
      overlays.open({ kind: "find", ...key });
    }

    follow();
  };

  return {
    /** Find: opens the bar over the front tab's page, its text selected. */
    open: () => {
      const key = pages.findable();

      if (key) {
        show(key, { kind: "open", key });
      }
    },
    /**
     * Find Next or Previous: steps while the bar is open, else opens it and
     * goes on with the remembered term.
     */
    again: (forward: boolean) => {
      const key = pages.findable();

      if (key) {
        show(key, { kind: "again", key, forward });
      }
    },
    /** The field's term, searched for as it is typed. */
    type: (term: string) => {
      dispatch({ kind: "type", term });
    },
    /** Enter, Shift+Enter or the bar's buttons. */
    step: (forward: boolean) => {
      dispatch({ kind: "step", forward });
    },
    found: (key: TabKey, result: FoundInPage) => {
      dispatch({ kind: "found", key, result });
    },
    /** A tab's page finished a load, which the bar over it searches again. */
    loaded: (key: TabKey) => {
      dispatch({ kind: "loaded", key });
    },
    /** Told when the overlays or the pages change, either of which can end it. */
    follow,
    /** The bar while it is open. */
    current: () => state.bar,
    /** Whether Find Next and Previous have a term to go on with. */
    canGoOn: () => state.bar !== undefined || state.remembered !== "",
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type Find = ReturnType<typeof createFind>;
