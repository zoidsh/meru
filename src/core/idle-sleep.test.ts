import { describe, expect, it } from "vitest";

import {
  SLEEP_AFTER_MS,
  SOUND_RECHECK_MS,
  followIdle,
  idleSleepPlan,
  inMeetCall,
} from "./idle-sleep.ts";
import type { IdleSleepInput } from "./idle-sleep.ts";
import type { Split } from "./pane-tree.ts";
import { gmailTab, newProfile } from "./state.ts";
import type { State, Tab } from "./state.ts";
import { tabKey } from "./tabs.ts";
import type { TabKey } from "./tabs.ts";

const HOUR = SLEEP_AFTER_MS["1h"];

const tab = (id: string, more: Partial<Tab> = {}): Tab => ({
  id,
  app: "calendar",
  url: `https://calendar.google.com/${id}`,
  title: id,
  ...more,
});

/**
 * Profile `p`, selected, with Gmail, pinned and selected, then `tabs`;
 * profile `q` with Gmail and a Calendar tab `q1`, selected.
 */
const state = (tabs: Tab[], more: Partial<State["profiles"][number]> = {}) =>
  ({
    version: 1,
    profiles: [
      {
        ...newProfile("p", "Default"),
        tabs: [gmailTab(), ...tabs],
        selectedTabId: "gmail",
        ...more,
      },
      {
        ...newProfile("q", "Work"),
        tabs: [gmailTab(), tab("q1")],
        selectedTabId: "q1",
      },
    ],
    selectedProfileId: "p",
  }) satisfies State;

/** Tabs `a` and `b` side by side. */
const AB_SPLIT: Split = {
  root: {
    direction: "row",
    children: [
      { size: 0.5, pane: "a" },
      { size: 0.5, pane: "b" },
    ],
  },
};

const ids = (keys: readonly TabKey[]) => keys.map(tabKey);

/**
 * The plan at `now`, every tab having a page and none playing sound unless
 * the input says otherwise, idle as `followIdle` saw them at 0.
 */
const plan = (input: Partial<IdleSleepInput> & { state: State }) =>
  idleSleepPlan({
    idleSince: followIdle(new Map(), input.state, 0),
    which: "all",
    after: "1h",
    now: HOUR,
    hasPage: () => true,
    audible: () => false,
    ...input,
  });

const meet = (url: string, app = "meet") => inMeetCall({ app, url });

describe(inMeetCall, () => {
  it("is a Meet tab on any page but Meet's home and landing pages, whatever their case, trailing slash or query, and never another app", () => {
    expect({
      meeting: meet("https://meet.google.com/abc-defg-hij"),
      withQuery: meet("https://meet.google.com/abc-defg-hij?authuser=1"),
      slash: meet("https://meet.google.com/abc-defg-hij/"),
      upperCase: meet("https://meet.google.com/ABC-DEFG-HIJ"),
      inner: meet("https://meet.google.com/_meet/abc-defg-hij?ijlm=1700000000"),
      lookup: meet("https://meet.google.com/lookup/abcdefghij"),
      bareCode: meet("https://meet.google.com/abcdefghij"),
      notAUrl: meet("meet"),
      home: meet("https://meet.google.com/"),
      homeWithQuery: meet("https://meet.google.com/?authuser=1"),
      landing: meet("https://meet.google.com/landing"),
      landingVariant: meet("https://meet.google.com/Landing/?pli=1"),
      otherApp: meet("https://meet.google.com/abc-defg-hij", "calendar"),
    }).toStrictEqual({
      meeting: true,
      withQuery: true,
      slash: true,
      upperCase: true,
      inner: true,
      lookup: true,
      bareCode: true,
      notAUrl: true,
      home: false,
      homeWithQuery: false,
      landing: false,
      landingVariant: false,
      otherApp: false,
    });
  });
});

describe(followIdle, () => {
  it("starts the clock of each hidden tab, the other profile's selected one included, and of none on screen or in its own window", () => {
    const since = followIdle(
      new Map(),
      state([tab("c"), tab("w", { ownWindow: true })]),
      5
    );

    expect([...since]).toStrictEqual([
      ["p/c", 5],
      ["q/gmail", 5],
      ["q/q1", 5],
    ]);
  });

  it("keeps a hidden tab's time, ends it when the tab shows, and starts it again when it is next hidden", () => {
    const hidden = followIdle(new Map(), state([tab("c")]), 5);

    expect(followIdle(hidden, state([tab("c")]), 50).get("p/c")).toBe(5);

    const shown = followIdle(
      hidden,
      state([tab("c")], { selectedTabId: "c" }),
      50
    );

    expect(shown.has("p/c")).toBeFalsy();
    expect(shown.get("p/gmail")).toBe(50);
    expect(followIdle(shown, state([tab("c")]), 90).get("p/c")).toBe(90);
  });

  it("counts every pane of the split on screen as shown", () => {
    const split = state([tab("a"), tab("b"), tab("c")], {
      selectedTabId: "a",
      splits: [AB_SPLIT],
    });

    expect([...followIdle(new Map(), split, 0).keys()]).toStrictEqual([
      "p/gmail",
      "p/c",
      "q/gmail",
      "q/q1",
    ]);
  });

  it("forgets a tab that is gone", () => {
    const since = followIdle(new Map([["p/gone", 1]]), state([]), 5);

    expect(since.has("p/gone")).toBeFalsy();
  });
});

describe(idleSleepPlan, () => {
  const pinned = tab("pinned", { pinned: true });
  const unpinned = tab("unpinned");
  const marked = tab("marked", { sleepWhenIdle: true });
  const markedPinned = tab("markedPinned", {
    pinned: true,
    sleepWhenIdle: true,
  });
  const three = state([pinned, unpinned, marked, markedPinned]);

  it("under All tabs takes every idle tab but Gmail's, the other profile's selected one included", () => {
    expect(ids(plan({ state: three, which: "all" }).due)).toStrictEqual([
      "p/pinned",
      "p/unpinned",
      "p/marked",
      "p/markedPinned",
      "q/q1",
    ]);
  });

  it("under Unpinned tabs takes those not pinned, marked or not", () => {
    expect(ids(plan({ state: three, which: "unpinned" }).due)).toStrictEqual([
      "p/unpinned",
      "p/marked",
      "q/q1",
    ]);
  });

  it("under Tabs you choose takes the marked ones alone, pinned or not; a mark that is not true is none", () => {
    expect(
      ids(
        plan({
          state: state([
            pinned,
            unpinned,
            marked,
            markedPinned,
            tab("odd", { sleepWhenIdle: "yes" }),
          ]),
          which: "chosen",
        }).due
      )
    ).toStrictEqual(["p/marked", "p/markedPinned"]);
  });

  it("never takes a Meet tab in a call, sounding or not, while one at Meet's home sleeps", () => {
    const current = state([
      tab("call", { app: "meet", url: "https://meet.google.com/abc-defg-hij" }),
      tab("home", { app: "meet", url: "https://meet.google.com/" }),
    ]);

    expect(ids(plan({ state: current }).due)).toStrictEqual(["p/home", "q/q1"]);
  });

  it("never takes a tab shown, in a split pane on screen, in its own window, playing sound, asleep or not loaded", () => {
    const current = state(
      [
        tab("a"),
        tab("b"),
        tab("own", { ownWindow: true }),
        tab("sound"),
        tab("asleep"),
      ],
      {
        selectedTabId: "a",
        splits: [AB_SPLIT],
      }
    );

    expect(
      ids(
        plan({
          state: current,
          idleSince: followIdle(new Map(), current, 0),
          hasPage: (key) => key.tabId !== "asleep" && key.profileId === "p",
          audible: (key) => key.tabId === "sound",
        }).due
      )
    ).toStrictEqual([]);
  });

  it("takes a tab once idle for the chosen time and not before, and says when to look again", () => {
    const current = state([unpinned]);
    const early = plan({ state: current, now: HOUR - 1 });

    expect(early.due).toStrictEqual([]);
    expect(early.next).toBe(HOUR);
    expect(ids(plan({ state: current, now: HOUR }).due)).toContain(
      "p/unpinned"
    );
  });

  it("with the clock restarted by showing, waits the whole time again from when it was hidden", () => {
    const hiddenAt0 = followIdle(new Map(), state([unpinned]), 0);
    const shown = followIdle(
      hiddenAt0,
      state([unpinned], { selectedTabId: "unpinned" }),
      HOUR / 2
    );
    const hiddenAgain = followIdle(shown, state([unpinned]), HOUR - 10);
    const at = plan({ state: state([unpinned]), idleSince: hiddenAgain });

    expect(ids(at.due)).not.toContain("p/unpinned");
    expect(at.next).toBe(2 * HOUR - 10);
  });

  it("with a shorter time takes at once the tabs already idle that long", () => {
    const current = state([unpinned]);

    expect(
      plan({ state: current, after: "1h", now: SLEEP_AFTER_MS["30m"] }).due
    ).toStrictEqual([]);
    expect(
      ids(
        plan({ state: current, after: "30m", now: SLEEP_AFTER_MS["30m"] }).due
      )
    ).toContain("p/unpinned");
  });

  it("looks again a minute on at a tab past its time kept awake by its sound", () => {
    const sounding = plan({
      state: state([]),
      which: "all",
      now: 2 * HOUR,
      audible: () => true,
    });

    expect(sounding.due).toStrictEqual([]);
    expect(sounding.next).toBe(2 * HOUR + SOUND_RECHECK_MS);
  });

  it("has nothing to look at while no tab could sleep", () => {
    expect(plan({ state: state([pinned]), which: "chosen" })).toStrictEqual({
      due: [],
    });
    expect(
      plan({ state: state([unpinned]), hasPage: () => false })
    ).toStrictEqual({ due: [] });
  });
});
