import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import type { App } from "./apps.ts";
import type { PaneTree, Split } from "./pane-tree.ts";
import {
  shownPanes,
  splitFits,
  splitTarget,
  splitWith,
  withoutPane,
} from "./split.ts";
import { decodeState, encodeState, gmailTab, newProfile } from "./state.ts";
import type { Profile, State, Tab } from "./state.ts";
import { closeTab, openTab, separateTab, splitTab } from "./tabs.ts";

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

const split = (...tabs: string[]): Split => ({
  root: row(...tabs) as Split["root"],
});

const profile = (
  selectedTabId: string,
  stored?: Split,
  tabs: Tab[] = ["a", "b", "c", "d"].map((id) => tab(id))
): Profile => ({
  ...newProfile("p", "Default"),
  tabs: [gmailTab(), ...tabs],
  selectedTabId,
  ...(stored && { split: stored }),
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

/** A tab of an app a later build added, which this one keeps but does not show. */
const later = { ...tab("x"), app: "keep" };

describe(splitTarget, () => {
  it("is the selected tab while it is in the split or there is none, and nothing outside one", () => {
    expect([
      splitTarget(profile("b", split("a", "b"))),
      splitTarget(profile("c")),
      splitTarget(profile("c", split("a", "b"))),
      splitTarget(profile("gone")),
    ]).toStrictEqual(["b", "c", undefined, undefined]);
  });
});

describe(shownPanes, () => {
  it("shows while the selected tab has a pane, without the panes of tabs this build does not show", () => {
    const withLater = profile("a", split("a", "x", "b"), [
      tab("a"),
      tab("b"),
      later,
    ]);

    expect([
      shownPanes(profile("a", split("a", "b"))),
      shownPanes(profile("c", split("a", "b"))),
      shownPanes(withLater),
      shownPanes(profile("a", split("a", "x"), [tab("a"), later])),
    ]).toStrictEqual([row("a", "b"), undefined, row("a", "b"), undefined]);
  });
});

describe(splitFits, () => {
  it("fits a new pane only where every pane keeps the minimum", () => {
    expect([
      splitFits(profile("a"), "row", { width: 488, height: 600 }),
      splitFits(profile("a"), "row", { width: 487, height: 600 }),
      splitFits(profile("a", split("a", "b")), "row", {
        width: 600,
        height: 600,
      }),
      splitFits(profile("a", split("a", "b")), "column", {
        width: 600,
        height: 600,
      }),
      splitFits(profile("c", split("a", "b")), "row", {
        width: 2000,
        height: 2000,
      }),
    ]).toStrictEqual([true, false, false, true, false]);
  });
});

describe(splitWith, () => {
  it("starts a split beside the selected tab, the new pane selected", () => {
    expect(splitWith(profile("a"), "b", "row")).toMatchObject({
      selectedTabId: "b",
      split: { root: row("a", "b") },
    });
  });

  it("refuses the target itself, a tab with a pane, one not shown, or no target", () => {
    expect([
      splitWith(profile("a"), "a", "row"),
      splitWith(profile("a", split("a", "b")), "b", "row"),
      splitWith(profile("a"), "gone", "row"),
      splitWith(profile("c", split("a", "b")), "d", "row"),
    ]).toStrictEqual([undefined, undefined, undefined, undefined]);
  });
});

describe(withoutPane, () => {
  it("names the shown pane now in the removed one's place", () => {
    expect(withoutPane(profile("b", split("a", "b", "c")), "b")).toStrictEqual({
      profile: profile("b", split("a", "c")),
      next: "c",
    });
    expect(
      withoutPane(
        profile("b", split("a", "b", "x"), [tab("a"), tab("b"), later]),
        "b"
      ).next
    ).toBe("a");
  });

  it("ends a split left with one pane and names it", () => {
    const ended = withoutPane(profile("a", split("a", "b")), "b");

    expect([ended.profile.split, ended.next]).toStrictEqual([undefined, "a"]);
  });
});

describe("the tab operations on a split", () => {
  it("splits a tab beside the selected pane, and opens a new one into a pane", () => {
    expect(
      of(splitTab(state(profile("a", split("a", "b"))), key("c"), "column"))
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
      },
    });

    const opened = openTab(
      state(profile("b", split("a", "b"))),
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
      },
    });
  });

  it("a link to Gmail while Gmail is another pane selects it, which focuses its pane", () => {
    const opened = openTab(
      state(profile("a", split("a", "gmail"))),
      "p",
      app("gmail"),
      "https://mail.google.com/mail/u/0/#inbox",
      () => "new"
    );

    expect(of(opened?.state)).toStrictEqual({
      selected: "gmail",
      split: split("a", "gmail"),
    });
  });

  it("separates a tab, which stays selected alone, and ends a split left with one pane", () => {
    expect(
      of(separateTab(state(profile("b", split("a", "b"))), key("b")))
    ).toStrictEqual({ selected: "b", split: undefined });
    expect(
      separateTab(state(profile("c", split("a", "b"))), key("c"))
    ).toBeUndefined();
  });

  it("closing the selected pane's tab selects the pane in its place, or the one left", () => {
    expect([
      of(closeTab(state(profile("c", split("a", "b", "c"))), key("c"))),
      of(closeTab(state(profile("b", split("a", "b"))), key("b"))),
    ]).toStrictEqual([
      { selected: "b", split: split("a", "b") },
      { selected: "a", split: undefined },
    ]);
  });

  it("closing a tab outside selects its neighbour, which shows the split if it has a pane", () => {
    expect([
      of(closeTab(state(profile("c", split("a", "b"))), key("c"))),
      of(
        closeTab(
          state(profile("c", split("a", "b"), [tab("a"), tab("b"), tab("c")])),
          key("c")
        )
      ),
    ]).toStrictEqual([
      { selected: "d", split: split("a", "b") },
      { selected: "b", split: split("a", "b") },
    ]);
  });
});

describe("a stored split", () => {
  it("comes back from the file as it went, and a tab gone from the list loses its pane", () => {
    const stored = structuredClone(
      encodeState(state(profile("c", split("a", "b", "c"))))
    ) as { profiles: { tabs: Tab[] }[] };

    expect(of(readBack(stored))).toStrictEqual({
      selected: "c",
      split: split("a", "b", "c"),
    });

    stored.profiles[0]?.tabs.pop();
    stored.profiles[0]?.tabs.splice(3, 1);

    expect(of(readBack(stored))).toStrictEqual({
      selected: "gmail",
      split: { root: row("a", "b") },
    });
  });

  it("keeps the pane of a tab this build does not know, or that does not parse, for a build that does", () => {
    const stored = {
      version: 1,
      selectedProfileId: "p",
      profiles: [
        {
          ...profile("a", split("a", "x", "y"), [tab("a"), later]),
          tabs: [gmailTab(), tab("a"), later, { id: "y", app: 7 }],
        },
      ],
    };
    const read = readBack(stored);

    expect(of(read)?.split).toStrictEqual(split("a", "x", "y"));
    expect(
      (encodeState(read as State) as typeof stored).profiles[0]?.split
    ).toStrictEqual(split("a", "x", "y"));
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
