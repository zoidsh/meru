import { describe, expect, it } from "vitest";

import { paneTabs } from "./pane-tree.ts";
import type { PaneTree, Split } from "./pane-tree.ts";
import { shownSplit, splitsOf } from "./split.ts";
import { gmailTab, newProfile } from "./state.ts";
import type { Profile, Tab } from "./state.ts";
import { viewDrop } from "./view-drop.ts";

const tab = (id: string): Tab => ({
  id,
  app: "calendar",
  url: `https://calendar.google.com/${id}`,
  title: id,
});

const row = (...tabs: string[]): PaneTree => ({
  direction: "row",
  children: tabs.map((pane) => ({ size: 1 / tabs.length, pane })),
});

const profile = (selectedTabId: string, ...splits: Split[]): Profile => ({
  ...newProfile("p", "Default"),
  tabs: [gmailTab(), ...["a", "b", "c", "d"].map((id) => tab(id))],
  selectedTabId,
  ...(splits.length > 0 && { splits }),
});

const split = (...tabs: string[]): Split => ({
  root: row(...tabs) as Split["root"],
});

const WIDE = { width: 1200, height: 800 };

/** The drop's kind and side, whether it fits, and the shown panes after it in reading order. */
const aim = (
  current: Profile,
  x: number,
  y: number,
  tabId: string,
  size = WIDE
) => {
  const drop = viewDrop(current, size, { x, y }, tabId);

  return (
    drop && [
      drop.kind,
      drop.side,
      drop.fits,
      paneTabs(shownSplit(drop.next)?.root ?? drop.next.selectedTabId),
    ]
  );
};

describe(viewDrop, () => {
  it("splits a tab shown alone at the nearest half, which lights up", () => {
    expect([
      aim(profile("a"), 100, 400, "b"),
      aim(profile("a"), 1000, 400, "b"),
      aim(profile("a"), 600, 100, "b"),
      aim(profile("a"), 600, 700, "b"),
    ]).toStrictEqual([
      ["pane", "left", true, ["b", "a"]],
      ["pane", "right", true, ["a", "b"]],
      ["pane", "top", true, ["b", "a"]],
      ["pane", "bottom", true, ["a", "b"]],
    ]);
    expect(
      viewDrop(profile("a"), WIDE, { x: 1000, y: 400 }, "b")
    ).toMatchObject({
      zone: { x: 600, y: 0, width: 600, height: 800 },
      next: { selectedTabId: "b" },
    });
  });

  it("takes the point and the zone in the area whatever its place in the window", () => {
    const placed = { x: 224, y: 40, ...WIDE };

    expect(
      viewDrop(profile("a"), placed, { x: 100, y: 400 }, "b")
    ).toMatchObject({ zone: { x: 0, y: 0, width: 600, height: 800 } });
  });

  it("does nothing over the tab's own page, in a gap, or where nothing else shows to go beside", () => {
    expect([
      aim(profile("b"), 600, 400, "b"),
      aim(profile("b"), 5, 400, "b"),
      aim(profile("a", split("a", "b")), 600, 400, "c"),
      aim(profile("a", split("a", "b")), 300, 400, "a"),
    ]).toStrictEqual([undefined, undefined, undefined, undefined]);
  });

  it("goes along the nearest outer edge within 24px, the window's inset included, with a third of the view", () => {
    expect([
      aim(profile("a", split("a", "b")), 10, 400, "c"),
      aim(profile("a", split("a", "b")), 1205, 400, "c"),
      aim(profile("a", split("a", "b")), 600, 790, "c"),
    ]).toStrictEqual([
      ["edge", "left", true, ["c", "a", "b"]],
      ["edge", "right", true, ["a", "b", "c"]],
      ["edge", "bottom", true, ["a", "b", "c"]],
    ]);

    const left = viewDrop(
      profile("a", split("a", "b")),
      WIDE,
      { x: 10, y: 400 },
      "c"
    );

    expect(left?.zone).toMatchObject({ x: 0, y: 0, height: 800 });
    expect(left?.zone.width).toBeCloseTo((1200 - 16) / 3, -1);
  });

  it("takes the nearer edge in a corner, and left before top where they are as near", () => {
    expect([
      aim(profile("a"), 5, 3, "b")?.[1],
      aim(profile("a"), 4, 4, "b")?.[1],
      aim(profile("a"), 1196, 797, "b")?.[1],
    ]).toStrictEqual(["top", "left", "bottom"]);
  });

  it("gives an edge's pane just enough for the minimum where a third is less", () => {
    const narrow = { width: 700, height: 800 };
    const drop = viewDrop(profile("a"), narrow, { x: 5, y: 400 }, "b");

    expect(drop?.fits).toBeTruthy();
    expect(drop?.zone.width).toBeGreaterThanOrEqual(240);
    expect(drop?.zone.width).toBeLessThan(250);
  });

  it("does nothing, saying so, where a pane would be under the minimum", () => {
    expect([
      aim(profile("a", split("a", "b")), 50, 400, "c", {
        width: 700,
        height: 800,
      }),
      aim(profile("a", split("a", "b", "c")), 10, 400, "d", {
        width: 800,
        height: 800,
      }),
    ]).toStrictEqual([
      ["pane", "left", false, ["c", "a", "b"]],
      ["edge", "left", false, ["d", "a", "b", "c"]],
    ]);
  });

  it("moves a tab of the split from its pane to the drop", () => {
    expect([
      aim(profile("a", split("a", "b", "c")), 100, 400, "c"),
      aim(profile("a", split("a", "b", "c")), 1195, 400, "a"),
    ]).toStrictEqual([
      ["pane", "left", true, ["c", "a", "b"]],
      ["edge", "right", true, ["b", "c", "a"]],
    ]);
  });

  it("starts a second split beside a tab shown alone while the profile has one, the first kept", () => {
    const drops = [
      viewDrop(profile("c", split("a", "b")), WIDE, { x: 900, y: 400 }, "d"),
      viewDrop(profile("c", split("a", "b")), WIDE, { x: 5, y: 400 }, "d"),
    ];

    expect(
      drops.map(
        (drop) => drop && splitsOf(drop.next).map(({ root }) => paneTabs(root))
      )
    ).toStrictEqual([
      [
        ["a", "b"],
        ["c", "d"],
      ],
      [
        ["a", "b"],
        ["d", "c"],
      ],
    ]);
  });

  it("moves a tab of another split into the shown one, the other ending at one pane", () => {
    const two = profile("a", split("a", "b"), split("c", "d"));

    expect([
      aim(two, 1100, 400, "c"),
      viewDrop(two, WIDE, { x: 1100, y: 400 }, "c")?.next.splits?.length,
    ]).toStrictEqual([["pane", "right", true, ["a", "b", "c"]], 1]);
  });

  it("lands nothing over the pages while the split is maximized, neither beside the pane it shows nor along an edge", () => {
    const maximized = profile("a", {
      ...split("a", "b", "c"),
      maximized: true,
    });

    expect([
      viewDrop(maximized, WIDE, { x: 100, y: 400 }, "d"),
      viewDrop(maximized, WIDE, { x: 5, y: 400 }, "d"),
      viewDrop(maximized, WIDE, { x: 1100, y: 400 }, "b"),
    ]).toStrictEqual([undefined, undefined, undefined]);
  });
});
