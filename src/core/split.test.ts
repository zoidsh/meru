import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import type { App } from "./apps.ts";
import type { PaneTree, Split } from "./pane-tree.ts";
import {
  focusSelected,
  shownSplit,
  splitFits,
  splitTarget,
  splitWith,
  withoutPane,
} from "./split.ts";
import { decodeState, encodeState, gmailTab, newProfile } from "./state.ts";
import type { Profile, State, Tab } from "./state.ts";
import { closeTab, openTab, selectTab, separateTab, splitTab } from "./tabs.ts";

const app = (id: string) => findApp(APPS, id) as App;

const tab = (id: string, appId = "calendar"): Tab => ({
  id,
  app: appId,
  url: `https://${appId}.google.com/${id}`,
  title: id,
});

const row = (...tabs: string[]): PaneTree => ({
  direction: "row",
  children: tabs.map((pane) => ({ size: 1 / tabs.length, pane })),
});

const profile = (
  selectedTabId: string,
  split?: Split,
  tabs = ["a", "b", "c", "d"]
): Profile => ({
  ...newProfile("p", "Default"),
  tabs: [gmailTab(), ...tabs.map((id) => tab(id))],
  selectedTabId,
  ...(split && { split }),
});

const ab = (focused = "a"): Split => ({
  root: row("a", "b") as Split["root"],
  focused,
});

const state = (current: Profile): State => ({
  version: 1,
  profiles: [current],
  selectedProfileId: current.id,
});

const of = (next: State | undefined) => {
  const [first] = next?.profiles ?? [];

  return first && { selected: first.selectedTabId, split: first.split };
};

const key = (tabId: string) => ({ profileId: "p", tabId });

const readBack = (stored: unknown) => {
  const result = decodeState(stored);

  return result.kind === "read" ? result.value : undefined;
};

describe(splitTarget, () => {
  it("is the focused pane while the split shows, the selected tab without one, and none outside one", () => {
    expect([
      splitTarget(profile("b", ab("b"))),
      splitTarget(profile("c")),
      splitTarget(profile("c", ab())),
      splitTarget(profile("gone")),
    ]).toStrictEqual(["b", "c", undefined, undefined]);
  });
});

describe(shownSplit, () => {
  it("shows while the selected tab has a pane", () => {
    expect([
      shownSplit(profile("a", ab())),
      shownSplit(profile("c", ab())),
    ]).toStrictEqual([ab(), undefined]);
  });
});

describe(splitFits, () => {
  it("fits a new pane only where every pane keeps the minimum", () => {
    expect([
      splitFits(profile("a"), "row", { width: 488, height: 600 }),
      splitFits(profile("a"), "row", { width: 487, height: 600 }),
      splitFits(profile("a", ab()), "row", { width: 600, height: 600 }),
      splitFits(profile("a", ab()), "column", { width: 600, height: 600 }),
      splitFits(profile("c", ab()), "row", { width: 2000, height: 2000 }),
    ]).toStrictEqual([true, false, false, true, false]);
  });
});

describe(splitWith, () => {
  it("starts a split beside the selected tab, the new pane focused and selected", () => {
    expect(splitWith(profile("a"), "b", "row")).toMatchObject({
      selectedTabId: "b",
      split: { root: row("a", "b"), focused: "b" },
    });
  });

  it("refuses the target itself, a tab with a pane, one not shown, or no target", () => {
    expect([
      splitWith(profile("a"), "a", "row"),
      splitWith(profile("a", ab()), "b", "row"),
      splitWith(profile("a"), "gone", "row"),
      splitWith(profile("c", ab()), "d", "row"),
    ]).toStrictEqual([undefined, undefined, undefined, undefined]);
  });
});

describe(withoutPane, () => {
  it("moves a focused pane's focus to the pane now in its place", () => {
    const three: Split = {
      root: row("a", "b", "c") as Split["root"],
      focused: "b",
    };

    expect(withoutPane(profile("b", three), "b").profile.split).toStrictEqual({
      root: row("a", "c"),
      focused: "c",
    });
  });

  it("ends a split left with one pane and names it", () => {
    const ended = withoutPane(profile("a", ab()), "b");

    expect([ended.profile.split, ended.alone]).toStrictEqual([undefined, "a"]);
  });
});

describe(focusSelected, () => {
  it("follows the selected tab into the split, and leaves it outside", () => {
    expect([
      focusSelected(profile("b", ab("a"))).split?.focused,
      focusSelected(profile("c", ab("a"))).split?.focused,
    ]).toStrictEqual(["b", "a"]);
  });
});

describe("the tab operations on a split", () => {
  it("selecting a tab in the split focuses its pane, and one outside keeps the focus for the return", () => {
    expect([
      of(selectTab(state(profile("a", ab())), key("b"))),
      of(selectTab(state(profile("a", ab())), key("c"))),
    ]).toStrictEqual([
      { selected: "b", split: ab("b") },
      { selected: "c", split: ab("a") },
    ]);
  });

  it("splits a tab beside the focused pane, and opens a new one into a pane", () => {
    expect(
      of(splitTab(state(profile("a", ab())), key("c"), "column"))
    ).toStrictEqual({
      selected: "c",
      split: {
        root: {
          direction: "row",
          children: [
            {
              size: 0.5,
              pane: {
                direction: "column",
                children: [
                  { size: 0.5, pane: "a" },
                  { size: 0.5, pane: "c" },
                ],
              },
            },
            { size: 0.5, pane: "b" },
          ],
        },
        focused: "c",
      },
    });

    const opened = openTab(
      state(profile("b", ab("b"))),
      "p",
      app("drive"),
      "https://drive.google.com/",
      () => "new",
      undefined,
      "row"
    );

    expect(of(opened?.state)).toStrictEqual({
      selected: "new",
      split: {
        root: {
          direction: "row",
          children: [
            { size: 0.5, pane: "a" },
            { size: 0.25, pane: "b" },
            { size: 0.25, pane: "new" },
          ],
        },
        focused: "new",
      },
    });
  });

  it("separates a tab, which stays selected alone, and ends a split left with one pane", () => {
    expect(
      of(separateTab(state(profile("b", ab("b"))), key("b")))
    ).toStrictEqual({
      selected: "b",
      split: undefined,
    });
    expect(separateTab(state(profile("c", ab())), key("c"))).toBeUndefined();
  });

  it("closing the focused pane's tab selects the pane taking its focus, or the one left", () => {
    const three: Split = {
      root: row("a", "b", "c") as Split["root"],
      focused: "c",
    };

    expect([
      of(closeTab(state(profile("c", three)), key("c"))),
      of(closeTab(state(profile("b", ab("b"))), key("b"))),
    ]).toStrictEqual([
      { selected: "b", split: { root: row("a", "b"), focused: "b" } },
      { selected: "a", split: undefined },
    ]);
  });

  it("closing a tab outside that leaves a split tab next focuses that tab's pane", () => {
    expect(of(closeTab(state(profile("c", ab("a"))), key("c")))).toStrictEqual({
      selected: "d",
      split: ab("a"),
    });
    expect(
      of(closeTab(state(profile("c", ab("a"), ["a", "b", "c"])), key("c")))
    ).toStrictEqual({ selected: "b", split: ab("b") });
  });
});

describe("a stored split", () => {
  it("comes back from the file as it went, and a tab gone from it loses its pane", () => {
    const three: Split = {
      root: row("a", "b", "c") as Split["root"],
      focused: "c",
    };
    const stored = structuredClone(encodeState(state(profile("c", three)))) as {
      profiles: { tabs: Tab[] }[];
    };

    expect(of(readBack(stored))).toStrictEqual({
      selected: "c",
      split: three,
    });

    stored.profiles[0]?.tabs.pop();
    stored.profiles[0]?.tabs.splice(3, 1);

    expect(of(readBack(stored))).toStrictEqual({
      selected: "gmail",
      split: { root: row("a", "b"), focused: "a" },
    });
  });

  it("keeps a split it cannot read as found, and shows none", () => {
    const stored = {
      version: 1,
      selectedProfileId: "p",
      profiles: [{ ...profile("a"), split: { root: 5 } }],
    };
    const read = readBack(stored);

    expect(of(read)?.split).toBeUndefined();
    expect(
      (encodeState(read as State) as typeof stored).profiles[0]?.split
    ).toStrictEqual({ root: 5 });
  });
});
