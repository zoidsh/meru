import { describe, expect, it } from "vitest";

import {
  FIND_BAR,
  NO_FIND,
  canGoOn,
  findRectangle,
  openBar,
  shownBar,
  transitionFind,
} from "./find.ts";
import type { FindEvent, FindState } from "./find.ts";

const mail = { profileId: "a", tabId: "gmail" };
const week = { profileId: "a", tabId: "c1" };

/** The state after each event in turn, with the effects of the last. */
const after = (events: FindEvent[], from: FindState = NO_FIND) => {
  let last: ReturnType<typeof transitionFind> = { state: from, effects: [] };

  for (const event of events) {
    last = transitionFind(last.state, event);
  }

  return last;
};

/** Gmail in front with its bar open, searching for `term` as request 1. */
const searching = (term: string): FindEvent[] => [
  { kind: "front", key: mail },
  { kind: "open" },
  { kind: "type", term },
  { kind: "requested", key: mail, requestId: 1 },
];

const found = (
  requestId: number,
  ordinal: number,
  matches: number,
  key = mail
): FindEvent => ({
  kind: "found",
  key,
  result: { requestId, ordinal, matches },
});

describe(transitionFind, () => {
  it("opens the front tab's bar empty, searching for nothing yet", () => {
    const { state, effects } = after([
      { kind: "front", key: mail },
      { kind: "open" },
    ]);

    expect(shownBar(state)).toStrictEqual({
      key: mail,
      open: true,
      term: "",
      ordinal: 0,
      matches: 0,
      requestId: undefined,
      awaitingLoad: false,
      opened: 1,
    });
    expect(effects).toStrictEqual([]);
  });

  it("opens nothing with no front page", () => {
    expect(after([{ kind: "open" }]).state).toStrictEqual({
      ...NO_FIND,
    });
  });

  it("searches as the term is typed and shows the answer to it", () => {
    const typed = after([
      { kind: "front", key: mail },
      { kind: "open" },
      { kind: "type", term: "apple" },
    ]);

    expect(typed.effects).toStrictEqual([
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: true,
        forward: true,
      },
    ]);
    expect(
      shownBar(
        after(
          [{ kind: "requested", key: mail, requestId: 1 }, found(1, 1, 3)],
          typed.state
        ).state
      )
    ).toMatchObject({ term: "apple", ordinal: 1, matches: 3 });
  });

  it("steps through the search going on, either way, and starts one with nothing found yet", () => {
    const pending = after(searching("apple"));
    const going = after([found(1, 1, 3)], pending.state);

    expect(
      [
        transitionFind(going.state, { kind: "step", forward: true }),
        transitionFind(going.state, { kind: "step", forward: false }),
        transitionFind(pending.state, { kind: "step", forward: false }),
      ].map(({ effects }) => effects[0])
    ).toStrictEqual([
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: false,
        forward: true,
      },
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: false,
        forward: false,
      },
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: true,
        forward: false,
      },
    ]);
  });

  it("shows the page's wrap from the last match to the first", () => {
    const { state } = after([
      ...searching("apple"),
      found(1, 3, 3),
      { kind: "step", forward: true },
      { kind: "requested", key: mail, requestId: 2 },
      found(2, 1, 3),
    ]);

    expect(shownBar(state)).toMatchObject({ ordinal: 1, matches: 3 });
  });

  it("drops an answer to an earlier search, late or out of order, and one from another tab's page", () => {
    const { state } = after([
      { kind: "front", key: mail },
      { kind: "open" },
      { kind: "type", term: "ap" },
      { kind: "requested", key: mail, requestId: 1 },
      { kind: "type", term: "apple" },
      { kind: "requested", key: mail, requestId: 2 },
      found(2, 1, 3),
      found(1, 4, 9),
      found(2, 2, 7, week),
    ]);

    expect(shownBar(state)).toMatchObject({
      term: "apple",
      ordinal: 1,
      matches: 3,
    });
  });

  it("stores 0/0 for no match, whatever ordinal the page gives", () => {
    const { state } = after([...searching("pear"), found(1, 1, 0)]);

    expect(shownBar(state)).toMatchObject({ ordinal: 0, matches: 0 });
  });

  it("clears the highlights and the count when the field is emptied", () => {
    const { state, effects } = after([
      ...searching("apple"),
      found(1, 2, 3),
      { kind: "type", term: "" },
    ]);

    expect(effects).toStrictEqual([
      { kind: "stop", key: mail, keepSelection: false },
    ]);
    expect(shownBar(state)).toMatchObject({
      term: "",
      ordinal: 0,
      matches: 0,
      requestId: undefined,
    });
  });

  it("closes ending the search with the match kept selected, and keeps the tab's term for Find Next", () => {
    const { state, effects } = after([
      ...searching("apple"),
      { kind: "close" },
    ]);

    expect([effects, shownBar(state), canGoOn(state)]).toStrictEqual([
      [{ kind: "stop", key: mail, keepSelection: true }],
      undefined,
      true,
    ]);
  });

  it("opens again with the tab's term and searches for it, the caret moved back", () => {
    const { state, effects } = after([
      ...searching("apple"),
      { kind: "close" },
      { kind: "open" },
    ]);

    expect(shownBar(state)).toMatchObject({ term: "apple", opened: 2 });
    expect(effects).toStrictEqual([
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: true,
        forward: true,
      },
    ]);
  });

  it("moves the caret back when opened while open, searching nothing", () => {
    const { state, effects } = after([...searching("apple"), { kind: "open" }]);

    expect([
      shownBar(state)?.opened,
      shownBar(state)?.requestId,
      effects,
    ]).toStrictEqual([2, 1, []]);
  });

  it("keeps a term to each tab: another tab opens empty and has nothing to go on with", () => {
    const { state } = after([
      ...searching("apple"),
      { kind: "front", key: week },
    ]);
    const other = after([{ kind: "open" }], state);

    expect([canGoOn(state), shownBar(other.state)?.term]).toStrictEqual([
      false,
      "",
    ]);
  });

  it("hides the bar when another tab comes to the front, its search going on, and shows it again on return where it was", () => {
    const away = after([
      ...searching("apple"),
      found(1, 2, 3),
      { kind: "front", key: week },
    ]);
    const back = transitionFind(away.state, { kind: "front", key: mail });
    const step = transitionFind(back.state, { kind: "step", forward: true });

    expect([away.effects, shownBar(away.state)]).toStrictEqual([[], undefined]);
    expect([back.effects, shownBar(back.state)]).toStrictEqual([
      [],
      shownBar(after([...searching("apple"), found(1, 2, 3)]).state),
    ]);
    expect(step.effects).toStrictEqual([
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: false,
        forward: true,
      },
    ]);
  });

  it("keeps a hidden bar's count with its page, searching again on its moves", () => {
    const away = after([
      ...searching("apple"),
      found(1, 2, 3),
      { kind: "front", key: week },
      { kind: "navigated", key: mail, inPage: true },
    ]);
    const answered = after(
      [{ kind: "requested", key: mail, requestId: 2 }, found(2, 1, 1)],
      away.state
    );

    expect(away.effects).toHaveLength(1);
    expect(answered.state.bars["a/gmail"]).toMatchObject({
      ordinal: 1,
      matches: 1,
    });
  });

  it("goes on with the tab's term from closed, opening that way, and steps while open", () => {
    const closed = after([
      ...searching("apple"),
      found(1, 1, 3),
      { kind: "close" },
      { kind: "again", forward: false },
    ]);
    const open = after([
      ...searching("apple"),
      found(1, 1, 3),
      { kind: "again", forward: true },
    ]);

    expect([closed.effects, open.effects]).toStrictEqual([
      [
        {
          kind: "search",
          key: mail,
          term: "apple",
          findNext: true,
          forward: false,
        },
      ],
      [
        {
          kind: "search",
          key: mail,
          term: "apple",
          findNext: false,
          forward: true,
        },
      ],
    ]);
  });

  it("searches again on a move within the page, and on a new document once it has loaded, never on a frame's load", () => {
    const going = after([...searching("apple"), found(1, 2, 3)]);

    expect(
      [
        [{ kind: "navigated", key: mail, inPage: true }],
        [{ kind: "loaded", key: mail }],
        [{ kind: "navigated", key: mail, inPage: false }],
        [
          { kind: "navigated", key: mail, inPage: false },
          { kind: "loaded", key: mail },
        ],
        [
          { kind: "navigated", key: mail, inPage: false },
          { kind: "loaded", key: mail },
          { kind: "loaded", key: mail },
        ],
      ].map(
        (events) => after(events as FindEvent[], going.state).effects.length
      )
    ).toStrictEqual([1, 0, 0, 1, 0]);
  });

  it("forgets a tab's bar and term when the tab closes or sleeps", () => {
    const { state } = after([
      ...searching("apple"),
      { kind: "close" },
      { kind: "forget", key: mail },
    ]);

    expect([canGoOn(state), state.bars]).toStrictEqual([false, {}]);
  });

  it("opens, types into, steps and closes the bar of a tab in its own window that the event names, the front tab's bar left as it is", () => {
    const away = { profileId: "a", tabId: "w" };
    const opened = after([
      ...searching("apple"),
      { kind: "open", key: away },
      { kind: "type", term: "pear", key: away },
    ]);
    const stepped = transitionFind(opened.state, {
      kind: "step",
      forward: false,
      key: away,
    });
    const closed = transitionFind(opened.state, { kind: "close", key: away });

    expect([
      openBar(opened.state, away)?.term,
      shownBar(opened.state)?.term,
      opened.effects,
      stepped.effects,
      openBar(closed.state, away),
      shownBar(closed.state)?.term,
      closed.effects,
      canGoOn(closed.state, away),
    ]).toStrictEqual([
      "pear",
      "apple",
      [
        {
          kind: "search",
          key: away,
          term: "pear",
          findNext: true,
          forward: true,
        },
      ],
      [
        {
          kind: "search",
          key: away,
          term: "pear",
          findNext: true,
          forward: false,
        },
      ],
      undefined,
      "apple",
      [{ kind: "stop", key: away, keepSelection: true }],
      true,
    ]);
  });

  it("ends a moved tab's search, clearing its highlights, and forgets its bar; nothing for a tab with none", () => {
    const moved = after([...searching("apple"), { kind: "moved", key: mail }]);

    expect([
      moved.state.bars,
      moved.effects,
      after([{ kind: "moved", key: week }]).effects,
    ]).toStrictEqual([
      {},
      [{ kind: "stop", key: mail, keepSelection: false }],
      [],
    ]);
  });

  it("does nothing with no bar shown but open and go on", () => {
    const front = after([{ kind: "front", key: mail }]).state;

    for (const event of [
      { kind: "type", term: "apple" },
      { kind: "step", forward: true },
      { kind: "requested", key: mail, requestId: 1 },
      found(1, 1, 1),
      { kind: "navigated", key: mail, inPage: true },
      { kind: "loaded", key: mail },
      { kind: "close" },
      { kind: "forget", key: mail },
      { kind: "front", key: mail },
    ] satisfies FindEvent[]) {
      expect(transitionFind(front, event)).toStrictEqual({
        state: front,
        effects: [],
      });
    }
  });
});

describe(findRectangle, () => {
  const area = { x: 240, y: 40, width: 1000, height: 700 };

  it("sits 8px in from the top right of the page area outside a split, the bar's size", () => {
    expect(findRectangle(area, undefined)).toStrictEqual({
      x: 1240 - 8 - FIND_BAR.width,
      y: 48,
      ...FIND_BAR,
    });
  });

  it("sits 8px in from the top right of the pane, which the page area places", () => {
    expect(
      findRectangle(area, { x: 504, y: 352, width: 496, height: 348 })
    ).toStrictEqual({ x: 1240 - 8 - FIND_BAR.width, y: 400, ...FIND_BAR });
  });

  it("keeps inside a pane narrower than the bar", () => {
    expect(
      findRectangle(area, { x: 0, y: 0, width: 300, height: 40 })
    ).toStrictEqual({ x: 248, y: 48, width: 284, height: 24 });
  });
});
