import { tabKey } from "./tabs.ts";
import type { TabKey } from "./tabs.ts";
import type { Rectangle } from "./window-bounds.ts";

const sameTab = (a: TabKey | undefined, b: TabKey | undefined) =>
  a !== undefined && b !== undefined && tabKey(a) === tabKey(b);

/** The longest term the bar searches for. */
export const FIND_TERM_MAX_LENGTH = 1000;

/** What a page answered of one search: the match shown and how many there are. */
export interface FoundInPage {
  requestId: number;
  /** 1-based; 0 with no match. */
  ordinal: number;
  matches: number;
}

/**
 * A tab's find bar: open or closed, and its term, kept for the session
 * until the tab closes or sleeps.
 */
export interface FindBar {
  key: TabKey;
  open: boolean;
  term: string;
  /** The match shown, 1-based; 0 with none. */
  ordinal: number;
  matches: number;
  /**
   * The page's id for the latest search asked of it, whose answer alone the
   * bar shows; an earlier one may answer late or never.
   */
  requestId: number | undefined;
  /**
   * A new document is loading, whose load searches again; a frame's load
   * within the page does not.
   */
  awaitingLoad: boolean;
  /** Counts each open, so the shell puts the field's caret back at its end. */
  opened: number;
}

export interface FindState {
  /** Each tab's bar, by `tabKey`. */
  bars: Readonly<Record<string, FindBar>>;
  /** The front tab with a page to search, whose bar alone shows. */
  front: TabKey | undefined;
  opens: number;
}

export const NO_FIND: FindState = { bars: {}, front: undefined, opens: 0 };

/** The front tab's bar while it is open, the one that shows. */
export const shownBar = ({ bars, front }: FindState) => {
  const bar = front && bars[tabKey(front)];

  return bar && bar.open ? bar : undefined;
};

/** Whether Find Next and Previous have a term to go on with on the front tab. */
export const canGoOn = (state: FindState) => {
  const bar = state.front && state.bars[tabKey(state.front)];

  return bar !== undefined && (bar.open || bar.term !== "");
};

export type FindEvent =
  /** Another tab, or none, is now the front with a page to search. */
  | { kind: "front"; key: TabKey | undefined }
  /** Find: opens the front tab's bar, or puts the caret back in its field. */
  | { kind: "open" }
  /**
   * Find Next or Previous: steps while the front tab's bar is open, else
   * opens it and searches for its term that way.
   */
  | { kind: "again"; forward: boolean }
  | { kind: "type"; term: string }
  /** Enter, Shift+Enter or the bar's buttons. */
  | { kind: "step"; forward: boolean }
  /** The page took a search and gave it this id. */
  | { kind: "requested"; key: TabKey; requestId: number }
  | { kind: "found"; key: TabKey; result: FoundInPage }
  /** The tab's main frame went elsewhere, within its document or to a new one. */
  | { kind: "navigated"; key: TabKey; inPage: boolean }
  /** The tab's page stopped loading, a frame of it or a new document. */
  | { kind: "loaded"; key: TabKey }
  /** Escape or Close on the bar that shows. */
  | { kind: "close" }
  /** The tab closed or slept, taking its bar and term with it. */
  | { kind: "forget"; key: TabKey }
  /**
   * The tab's page moved to another window, where it has no bar yet: its
   * search ends, taking its highlights, and its bar and term go.
   */
  | { kind: "moved"; key: TabKey };

export type FindEffect =
  /** `findNext` starts a new search, else steps through the one going on. */
  | {
      kind: "search";
      key: TabKey;
      term: string;
      findNext: boolean;
      forward: boolean;
    }
  | { kind: "stop"; key: TabKey; keepSelection: boolean };

interface Transition {
  state: FindState;
  effects: FindEffect[];
}

const search = (
  bar: FindBar,
  { findNext = true, forward = true } = {}
): FindEffect[] =>
  bar.term === ""
    ? []
    : [{ kind: "search", key: bar.key, term: bar.term, findNext, forward }];

const step = (bar: FindBar, forward: boolean) =>
  // With nothing found yet there is no search to step through.
  search(bar, { findNext: bar.matches === 0, forward });

const withBar = (state: FindState, bar: FindBar): FindState => ({
  ...state,
  bars: { ...state.bars, [tabKey(bar.key)]: bar },
});

const freshBar = (key: TabKey): FindBar => ({
  key,
  open: false,
  term: "",
  ordinal: 0,
  matches: 0,
  requestId: undefined,
  awaitingLoad: false,
  opened: 0,
});

/**
 * Another front. The bar that showed hides with its search going on in its
 * page, which a new search could not resume at its match, so it comes back
 * where it was.
 */
const toFront = (state: FindState, key: TabKey | undefined): Transition =>
  sameTab(state.front, key) || (!state.front && !key)
    ? { state, effects: [] }
    : { state: { ...state, front: key }, effects: [] };

const opened = (state: FindState, forward: boolean | undefined): Transition => {
  const { front } = state;

  if (!front) {
    return { state, effects: [] };
  }

  const bar = state.bars[tabKey(front)] ?? freshBar(front);
  const opens = state.opens + 1;
  const next = { ...withBar(state, { ...bar, opened: opens }), opens };

  if (bar.open) {
    return {
      state: next,
      effects: forward === undefined ? [] : step(bar, forward),
    };
  }

  const shown: FindBar = {
    ...bar,
    open: true,
    ordinal: 0,
    matches: 0,
    requestId: undefined,
    opened: opens,
  };

  return {
    state: withBar(next, shown),
    effects: search(shown, { forward: forward ?? true }),
  };
};

const typed = (state: FindState, bar: FindBar, term: string): Transition => {
  if (term !== "") {
    const next = { ...bar, term };

    return { state: withBar(state, next), effects: search(next) };
  }

  return {
    state: withBar(state, {
      ...bar,
      term,
      ordinal: 0,
      matches: 0,
      requestId: undefined,
    }),
    effects: [{ kind: "stop", key: bar.key, keepSelection: false }],
  };
};

/** What a tab's page told of its bar: a search's id, an answer or a load. */
const fromPage = (
  state: FindState,
  bar: FindBar,
  event: Extract<
    FindEvent,
    { kind: "requested" | "found" | "navigated" | "loaded" }
  >
): Transition => {
  switch (event.kind) {
    case "requested": {
      return {
        state: withBar(state, { ...bar, requestId: event.requestId }),
        effects: [],
      };
    }
    case "found": {
      const { requestId, ordinal, matches } = event.result;

      return requestId === bar.requestId && bar.term !== ""
        ? {
            state: withBar(state, {
              ...bar,
              ordinal: matches === 0 ? 0 : ordinal,
              matches,
            }),
            effects: [],
          }
        : { state, effects: [] };
    }
    case "navigated": {
      if (event.inPage) {
        return { state, effects: bar.open ? search(bar) : [] };
      }

      return {
        state: withBar(state, { ...bar, awaitingLoad: true }),
        effects: [],
      };
    }
    default: {
      return bar.awaitingLoad
        ? {
            state: withBar(state, { ...bar, awaitingLoad: false }),
            effects: bar.open ? search(bar) : [],
          }
        : { state, effects: [] };
    }
  }
};

/**
 * The find bars after `event`, with what to ask of the pages. Each tab has
 * its own, and only the front tab's shows, though a hidden one's search goes
 * on; only the answer to the latest search counts; a new document, once
 * loaded, or a move within the page is searched again, a frame's load is
 * not.
 */
export const transitionFind = (
  state: FindState,
  event: FindEvent
): Transition => {
  const shown = shownBar(state);
  const unchanged = { state, effects: [] };

  switch (event.kind) {
    case "front": {
      return toFront(state, event.key);
    }
    case "open": {
      return opened(state, undefined);
    }
    case "again": {
      return opened(state, event.forward);
    }
    case "type": {
      return shown && shown.term !== event.term
        ? typed(state, shown, event.term)
        : unchanged;
    }
    case "step": {
      return shown ? { state, effects: step(shown, event.forward) } : unchanged;
    }
    case "close": {
      return shown
        ? {
            state: withBar(state, {
              ...shown,
              open: false,
              requestId: undefined,
            }),
            effects: [{ kind: "stop", key: shown.key, keepSelection: true }],
          }
        : unchanged;
    }
    case "forget":
    case "moved": {
      const id = tabKey(event.key);

      if (!(id in state.bars)) {
        return unchanged;
      }

      const bars = Object.fromEntries(
        Object.entries(state.bars).filter(([other]) => other !== id)
      );

      return {
        state: { ...state, bars },
        effects:
          event.kind === "moved"
            ? [{ kind: "stop", key: event.key, keepSelection: false }]
            : [],
      };
    }
    default: {
      const bar = state.bars[tabKey(event.key)];

      return bar ? fromPage(state, bar, event) : unchanged;
    }
  }
};

/** The bar's own size, which its view has exactly, so the page takes every press beside it. */
export const FIND_BAR = { width: 353, height: 40 } as const;

/** How far the bar sits in from its page's top and right edges. */
export const FIND_INSET = 8;

/**
 * Where the bar's view sits: `FIND_INSET` in from the top right of the
 * pane, placed in the page area, or of the whole page area outside a split,
 * and never past its left or bottom edge.
 */
export const findRectangle = (
  area: Rectangle,
  pane: Rectangle | undefined
): Rectangle => {
  const page = pane
    ? { ...pane, x: area.x + pane.x, y: area.y + pane.y }
    : area;
  const width = Math.max(
    0,
    Math.min(FIND_BAR.width, page.width - FIND_INSET * 2)
  );
  const height = Math.max(
    0,
    Math.min(FIND_BAR.height, page.height - FIND_INSET * 2)
  );

  return {
    x: page.x + page.width - FIND_INSET - width,
    y: page.y + FIND_INSET,
    width,
    height,
  };
};
