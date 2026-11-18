import { tabKey } from "./tabs.ts";
import type { TabKey } from "./tabs.ts";
import type { Rectangle } from "./window-bounds.ts";

const sameTab = (a: TabKey, b: TabKey) => tabKey(a) === tabKey(b);

/** The longest term the bar searches for. */
export const FIND_TERM_MAX_LENGTH = 1000;

/** What a page answered of one search: the match shown and how many there are. */
export interface FoundInPage {
  requestId: number;
  /** 1-based; 0 with no match. */
  ordinal: number;
  matches: number;
}

/** The find bar over a tab's page while it is open. */
export interface FindBar {
  key: TabKey;
  term: string;
  ordinal: number;
  matches: number;
  /**
   * The page's id for the latest search asked of it, whose answer alone the
   * bar shows; an earlier one may answer late or never.
   */
  requestId: number | undefined;
  /** Counts each open, so the shell selects the field's text again on one. */
  opened: number;
}

export interface FindState {
  bar: FindBar | undefined;
  /** The last term typed, for the next open; kept for the session alone. */
  remembered: string;
  opens: number;
}

export const NO_FIND: FindState = { bar: undefined, remembered: "", opens: 0 };

export type FindEvent =
  /** Find: opens the bar over the tab's page, or selects its text again. */
  | { kind: "open"; key: TabKey }
  /**
   * Find Next or Previous: steps while the bar is open over the tab, else
   * opens it and searches for the remembered term that way.
   */
  | { kind: "again"; key: TabKey; forward: boolean }
  | { kind: "type"; term: string }
  /** Enter, Shift+Enter or the bar's buttons. */
  | { kind: "step"; forward: boolean }
  /** The page took a search and gave it this id. */
  | { kind: "requested"; key: TabKey; requestId: number }
  | { kind: "found"; key: TabKey; result: FoundInPage }
  /** The tab's page finished a load, which leaves nothing found. */
  | { kind: "loaded"; key: TabKey }
  | { kind: "close" };

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
  key: TabKey,
  term: string,
  { findNext = true, forward = true } = {}
): FindEffect[] =>
  term === "" ? [] : [{ kind: "search", key, term, findNext, forward }];

const opened = (state: FindState, key: TabKey, forward = true): Transition => {
  const opens = state.opens + 1;
  const closing: FindEffect[] = state.bar
    ? [{ kind: "stop", key: state.bar.key, keepSelection: false }]
    : [];

  return {
    state: {
      ...state,
      opens,
      bar: {
        key,
        term: state.remembered,
        ordinal: 0,
        matches: 0,
        requestId: undefined,
        opened: opens,
      },
    },
    effects: [...closing, ...search(key, state.remembered, { forward })],
  };
};

const step = (bar: FindBar, forward: boolean) =>
  // With nothing found yet there is no search to step through.
  search(bar.key, bar.term, { findNext: bar.matches === 0, forward });

const typed = (state: FindState, bar: FindBar, term: string): Transition => {
  const next = { ...state, remembered: term, bar: { ...bar, term } };

  if (term !== "") {
    return { state: next, effects: search(bar.key, term) };
  }

  return {
    state: {
      ...next,
      bar: { ...next.bar, ordinal: 0, matches: 0, requestId: undefined },
    },
    effects: [{ kind: "stop", key: bar.key, keepSelection: false }],
  };
};

/** What the bar's own page told of it: a search's id, an answer or a load. */
const fromPage = (
  state: FindState,
  bar: FindBar,
  event: Extract<FindEvent, { kind: "requested" | "found" | "loaded" }>
): Transition => {
  switch (event.kind) {
    case "requested": {
      return {
        state: { ...state, bar: { ...bar, requestId: event.requestId } },
        effects: [],
      };
    }
    case "found": {
      const { requestId, ordinal, matches } = event.result;

      return requestId === bar.requestId && bar.term !== ""
        ? {
            state: { ...state, bar: { ...bar, ordinal, matches } },
            effects: [],
          }
        : { state, effects: [] };
    }
    default: {
      return { state, effects: search(bar.key, bar.term) };
    }
  }
};

/**
 * The find bar after `event`, with what to ask of the pages. Only the
 * answer to the latest search counts; a load searches again, as the page
 * that held the matches is gone.
 */
export const transitionFind = (
  state: FindState,
  event: FindEvent
): Transition => {
  const { bar } = state;
  const unchanged = { state, effects: [] };
  const onBar = (key: TabKey) => bar !== undefined && sameTab(bar.key, key);

  switch (event.kind) {
    case "open": {
      if (bar && onBar(event.key)) {
        const opens = state.opens + 1;

        return {
          state: { ...state, opens, bar: { ...bar, opened: opens } },
          effects: [],
        };
      }

      return opened(state, event.key);
    }
    case "again": {
      return bar && onBar(event.key)
        ? { state, effects: step(bar, event.forward) }
        : opened(state, event.key, event.forward);
    }
    case "type": {
      return bar && bar.term !== event.term
        ? typed(state, bar, event.term)
        : unchanged;
    }
    case "step": {
      return bar ? { state, effects: step(bar, event.forward) } : unchanged;
    }
    case "requested":
    case "found":
    case "loaded": {
      return bar && onBar(event.key) ? fromPage(state, bar, event) : unchanged;
    }
    default: {
      return bar
        ? {
            state: { ...state, bar: undefined },
            effects: [{ kind: "stop", key: bar.key, keepSelection: true }],
          }
        : unchanged;
    }
  }
};

/** The count as the bar shows it, such as 2/14; 0/0 with no match. */
export const findCount = ({
  ordinal,
  matches,
}: Pick<FindBar, "ordinal" | "matches">) => ({
  ordinal: matches === 0 ? 0 : ordinal,
  matches,
});

/** The view the bar is drawn in, at the top right of its page. */
export const FIND_VIEW = { width: 400, height: 56 } as const;

/**
 * Where the bar's view sits: at the top right of the pane, placed in the
 * page area, or of the whole page area outside a split.
 */
export const findRectangle = (
  area: Rectangle,
  pane: Rectangle | undefined
): Rectangle => {
  const page = pane
    ? { ...pane, x: area.x + pane.x, y: area.y + pane.y }
    : area;
  const width = Math.min(FIND_VIEW.width, page.width);
  const height = Math.min(FIND_VIEW.height, page.height);

  return { x: page.x + page.width - width, y: page.y, width, height };
};
