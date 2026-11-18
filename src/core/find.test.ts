import { describe, expect, it } from "vitest";

import { findCount, findRectangle, NO_FIND, transitionFind } from "./find.ts";
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

const searching = (term: string): FindEvent[] => [
  { kind: "open", key: mail },
  { kind: "type", term },
  { kind: "requested", key: mail, requestId: 1 },
];

describe(transitionFind, () => {
  it("opens empty over the tab, searching for nothing yet", () => {
    const { state, effects } = after([{ kind: "open", key: mail }]);

    expect(state.bar).toStrictEqual({
      key: mail,
      term: "",
      ordinal: 0,
      matches: 0,
      requestId: undefined,
      opened: 1,
    });
    expect(effects).toStrictEqual([]);
  });

  it("searches as the term is typed and shows the answer to it", () => {
    const typed = after([
      { kind: "open", key: mail },
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

    const { state } = after(
      [
        { kind: "requested", key: mail, requestId: 1 },
        {
          kind: "found",
          key: mail,
          result: { requestId: 1, ordinal: 1, matches: 3 },
        },
      ],
      typed.state
    );

    expect(state.bar).toMatchObject({ term: "apple", ordinal: 1, matches: 3 });
    expect(state.remembered).toBe("apple");
  });

  it("steps through the search going on, either way", () => {
    const found = after([
      ...searching("apple"),
      {
        kind: "found",
        key: mail,
        result: { requestId: 1, ordinal: 1, matches: 3 },
      },
    ]);

    expect(
      transitionFind(found.state, { kind: "step", forward: true }).effects
    ).toStrictEqual([
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: false,
        forward: true,
      },
    ]);
    expect(
      transitionFind(found.state, { kind: "step", forward: false }).effects
    ).toStrictEqual([
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: false,
        forward: false,
      },
    ]);
  });

  it("shows the page's wrap from the last match to the first", () => {
    const { state } = after([
      ...searching("apple"),
      {
        kind: "found",
        key: mail,
        result: { requestId: 1, ordinal: 3, matches: 3 },
      },
      { kind: "step", forward: true },
      { kind: "requested", key: mail, requestId: 2 },
      {
        kind: "found",
        key: mail,
        result: { requestId: 2, ordinal: 1, matches: 3 },
      },
    ]);

    expect(state.bar).toMatchObject({ ordinal: 1, matches: 3 });
  });

  it("starts a new search when stepping with nothing found yet", () => {
    const { effects } = after([
      ...searching("apple"),
      { kind: "step", forward: false },
    ]);

    expect(effects).toStrictEqual([
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: true,
        forward: false,
      },
    ]);
  });

  it("drops an answer to an earlier search, late or out of order", () => {
    const { state } = after([
      { kind: "open", key: mail },
      { kind: "type", term: "ap" },
      { kind: "requested", key: mail, requestId: 1 },
      { kind: "type", term: "apple" },
      { kind: "requested", key: mail, requestId: 2 },
      {
        kind: "found",
        key: mail,
        result: { requestId: 2, ordinal: 1, matches: 3 },
      },
      {
        kind: "found",
        key: mail,
        result: { requestId: 1, ordinal: 4, matches: 9 },
      },
    ]);

    expect(state.bar).toMatchObject({ term: "apple", ordinal: 1, matches: 3 });
  });

  it("drops an answer from another tab's page", () => {
    const { state } = after([
      ...searching("apple"),
      {
        kind: "found",
        key: week,
        result: { requestId: 1, ordinal: 1, matches: 7 },
      },
    ]);

    expect(state.bar).toMatchObject({ ordinal: 0, matches: 0 });
  });

  it("clears the highlights and the count when the field is emptied", () => {
    const { state, effects } = after([
      ...searching("apple"),
      {
        kind: "found",
        key: mail,
        result: { requestId: 1, ordinal: 2, matches: 3 },
      },
      { kind: "type", term: "" },
    ]);

    expect(effects).toStrictEqual([
      { kind: "stop", key: mail, keepSelection: false },
    ]);
    expect(state.bar).toMatchObject({
      term: "",
      ordinal: 0,
      matches: 0,
      requestId: undefined,
    });
    expect(
      transitionFind(state, {
        kind: "found",
        key: mail,
        result: { requestId: 1, ordinal: 2, matches: 3 },
      }).state.bar
    ).toMatchObject({ matches: 0 });
  });

  it("closes ending the search, the match kept selected, and remembers the term", () => {
    const { state, effects } = after([
      ...searching("apple"),
      { kind: "close" },
    ]);

    expect(effects).toStrictEqual([
      { kind: "stop", key: mail, keepSelection: true },
    ]);
    expect(state.bar).toBeUndefined();
    expect(state.remembered).toBe("apple");
  });

  it("opens again with the remembered term and searches for it", () => {
    const { state, effects } = after([
      ...searching("apple"),
      { kind: "close" },
      { kind: "open", key: week },
    ]);

    expect(state.bar).toMatchObject({
      key: week,
      term: "apple",
      ordinal: 0,
      opened: 2,
    });
    expect(effects).toStrictEqual([
      {
        kind: "search",
        key: week,
        term: "apple",
        findNext: true,
        forward: true,
      },
    ]);
  });

  it("selects the text again when opened while open, searching nothing", () => {
    const { state, effects } = after([
      ...searching("apple"),
      { kind: "open", key: mail },
    ]);

    expect(state.bar).toMatchObject({ term: "apple", requestId: 1, opened: 2 });
    expect(effects).toStrictEqual([]);
  });

  it("moves to another tab's page, ending the first one's search", () => {
    const { state, effects } = after([
      ...searching("apple"),
      { kind: "open", key: week },
    ]);

    expect(state.bar).toMatchObject({ key: week, term: "apple" });
    expect(effects).toStrictEqual([
      { kind: "stop", key: mail, keepSelection: false },
      {
        kind: "search",
        key: week,
        term: "apple",
        findNext: true,
        forward: true,
      },
    ]);
  });

  it("goes on with the remembered term from closed, opening that way", () => {
    const { state, effects } = after([
      ...searching("apple"),
      { kind: "close" },
      { kind: "again", key: mail, forward: false },
    ]);

    expect(state.bar).toMatchObject({ key: mail, term: "apple" });
    expect(effects).toStrictEqual([
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: true,
        forward: false,
      },
    ]);
  });

  it("steps when going on while open", () => {
    const { effects } = after([
      ...searching("apple"),
      {
        kind: "found",
        key: mail,
        result: { requestId: 1, ordinal: 1, matches: 3 },
      },
      { kind: "again", key: mail, forward: true },
    ]);

    expect(effects).toStrictEqual([
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: false,
        forward: true,
      },
    ]);
  });

  it("searches again when its page loads, and only its page", () => {
    const found = after([
      ...searching("apple"),
      {
        kind: "found",
        key: mail,
        result: { requestId: 1, ordinal: 2, matches: 3 },
      },
    ]);

    expect(
      transitionFind(found.state, { kind: "loaded", key: mail }).effects
    ).toStrictEqual([
      {
        kind: "search",
        key: mail,
        term: "apple",
        findNext: true,
        forward: true,
      },
    ]);
    expect(
      transitionFind(found.state, { kind: "loaded", key: week }).effects
    ).toStrictEqual([]);
  });

  it("does nothing closed but open and go on", () => {
    for (const event of [
      { kind: "type", term: "apple" },
      { kind: "step", forward: true },
      { kind: "requested", key: mail, requestId: 1 },
      {
        kind: "found",
        key: mail,
        result: { requestId: 1, ordinal: 1, matches: 1 },
      },
      { kind: "loaded", key: mail },
      { kind: "close" },
    ] satisfies FindEvent[]) {
      expect(transitionFind(NO_FIND, event)).toStrictEqual({
        state: NO_FIND,
        effects: [],
      });
    }
  });
});

describe(findCount, () => {
  it("shows 0/0 with no match", () => {
    expect(findCount({ ordinal: 1, matches: 0 })).toStrictEqual({
      ordinal: 0,
      matches: 0,
    });
    expect(findCount({ ordinal: 2, matches: 14 })).toStrictEqual({
      ordinal: 2,
      matches: 14,
    });
  });
});

describe(findRectangle, () => {
  const area = { x: 240, y: 40, width: 1000, height: 700 };

  it("sits at the top right of the page area outside a split", () => {
    expect(findRectangle(area, undefined)).toStrictEqual({
      x: 840,
      y: 40,
      width: 400,
      height: 56,
    });
  });

  it("sits at the top right of the pane, which the page area places", () => {
    expect(
      findRectangle(area, { x: 504, y: 352, width: 496, height: 348 })
    ).toStrictEqual({ x: 840, y: 392, width: 400, height: 56 });
  });

  it("keeps inside a pane narrower than the bar's view", () => {
    expect(
      findRectangle(area, { x: 0, y: 0, width: 300, height: 40 })
    ).toStrictEqual({
      x: 240,
      y: 40,
      width: 300,
      height: 40,
    });
  });
});
