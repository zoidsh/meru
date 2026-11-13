import { describe, expect, it } from "vitest";

import type { Group } from "../records/group.ts";
import type { LayoutNode } from "../records/layout.ts";
import type { Profile } from "../records/profile.ts";
import type { Tab } from "../records/tab.ts";
import { leaf } from "./layout.ts";
import {
  clamp,
  groupOf,
  moveItem,
  moveProfile,
  moveTab,
  orderedProfiles,
  orderedTabs,
  rowTabs,
} from "./ordering.ts";
import type { TabRow } from "./ordering.ts";

describe(clamp, () => {
  it("keeps a value inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe(moveItem, () => {
  it("moves an item forward and backward", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toStrictEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toStrictEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  it("clamps indexes outside the list", () => {
    expect(moveItem(["a", "b", "c"], -4, 99)).toStrictEqual(["b", "c", "a"]);
  });

  it("leaves the input alone and handles an empty list", () => {
    const items = ["a", "b"];
    moveItem(items, 0, 1);
    expect(items).toStrictEqual(["a", "b"]);
    expect(moveItem([], 0, 1)).toStrictEqual([]);
  });

  it("keeps every item for any pair of indexes", () => {
    const items = [1, 2, 3, 4, 5];
    for (let from = -1; from <= items.length; from += 1) {
      for (let to = -1; to <= items.length; to += 1) {
        expect(
          moveItem(items, from, to).toSorted((a, b) => a - b)
        ).toStrictEqual(items);
      }
    }
  });
});

const tabOf = (id: string, profileId: string): Tab => ({
  appId: "gmail",
  health: "ok",
  id,
  pinned: false,
  profileId,
  sleeping: false,
  title: id,
  url: "https://mail.google.com/",
  zoom: 1,
});

const chain = (tabIds: readonly string[]): LayoutNode => {
  const [first, ...rest] = tabIds;
  if (first === undefined) {
    throw new Error("A layout holds at least one tab");
  }
  const head = leaf(`pane-${first}`, first);
  return rest.length === 0
    ? head
    : {
        first: head,
        id: `split-${first}`,
        kind: "split",
        orientation: "vertical",
        ratio: 0.5,
        second: chain(rest),
      };
};

const groupWith = (id: string, profileId: string, tabIds: string[]): Group => ({
  id,
  layout: chain(tabIds),
  profileId,
  tabIds,
});

// Deterministic, so a failing seed fails the same way on every run.
const random = (seed: number) => {
  let state = seed;
  return (below: number) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % below;
  };
};

const randomState = (seed: number) => {
  const pick = random(seed);
  const profileIds = ["a", "b", "c"].slice(0, 1 + pick(3));
  const count = pick(12);
  const tabs: Tab[] = Array.from({ length: count }, (_, index) =>
    tabOf(`t${index}`, profileIds[pick(profileIds.length)] ?? "a")
  );
  const shuffled = tabs.toSorted(() => pick(3) - 1);
  const groups: Group[] = [];
  for (const profileId of profileIds) {
    const own = shuffled.filter((tab) => tab.profileId === profileId);
    while (own.length > 0) {
      const members = own.splice(0, 1 + pick(3)).map((tab) => tab.id);
      groups.push(groupWith(`g${groups.length}`, profileId, members));
    }
  }
  return { groups, profileIds, tabs };
};

const flat = (rows: readonly TabRow[]) =>
  rows.flatMap(rowTabs).map((tab) => tab.id);

const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1);

describe(orderedTabs, () => {
  it("keeps a group of one as a plain row and a bigger group as one row in the group's order", () => {
    const tabs = ["t1", "t2", "t3", "t4"].map((id) => tabOf(id, "a"));
    const groups = [
      groupWith("g1", "a", ["t1"]),
      groupWith("g2", "a", ["t4", "t2"]),
      groupWith("g3", "a", ["t3"]),
    ];
    const rows = orderedTabs(tabs, groups, "a");
    expect(
      rows.map((row) =>
        row.kind === "tab" ? row.tab.id : row.tabs.map((tab) => tab.id)
      )
    ).toStrictEqual(["t1", ["t4", "t2"], "t3"]);
    expect(orderedTabs(tabs, groups, "b")).toStrictEqual([]);
  });

  it.each(SEEDS)(
    "lists every tab of a profile exactly once (seed %i)",
    (seed) => {
      const { tabs, groups, profileIds } = randomState(seed);
      for (const profileId of profileIds) {
        const listed = flat(orderedTabs(tabs, groups, profileId));
        const own = tabs
          .filter((tab) => tab.profileId === profileId)
          .map((tab) => tab.id);
        expect(listed.toSorted()).toStrictEqual(own.toSorted());
      }
    }
  );
});

describe(moveTab, () => {
  it("moves a tab, and a grouped tab with its group", () => {
    const tabs = ["t1", "t2", "t3", "t4"].map((id) => tabOf(id, "a"));
    const groups = [
      groupWith("g1", "a", ["t1"]),
      groupWith("g2", "a", ["t2", "t3"]),
      groupWith("g3", "a", ["t4"]),
    ];
    expect(
      flat(orderedTabs(moveTab(tabs, groups, "t4", 0), groups, "a"))
    ).toStrictEqual(["t4", "t1", "t2", "t3"]);
    expect(
      flat(orderedTabs(moveTab(tabs, groups, "t3", 2), groups, "a"))
    ).toStrictEqual(["t1", "t4", "t2", "t3"]);
  });

  it("leaves other profiles' tabs where they were", () => {
    const tabs = [tabOf("t1", "a"), tabOf("t2", "b"), tabOf("t3", "a")];
    const groups = tabs.map((tab) =>
      groupWith(`g${tab.id}`, tab.profileId, [tab.id])
    );
    expect(moveTab(tabs, groups, "t3", 0).map((tab) => tab.id)).toStrictEqual([
      "t3",
      "t2",
      "t1",
    ]);
    expect(moveTab(tabs, groups, "missing", 0)).toStrictEqual(tabs);
  });

  it.each(SEEDS)(
    "keeps every tab, is stable under a no-op move and clamps a move past either end (seed %i)",
    (seed) => {
      const { tabs, groups, profileIds } = randomState(seed);
      const order = (moved: readonly Tab[], profileId: string) =>
        flat(orderedTabs(moved, groups, profileId));
      for (const profileId of profileIds) {
        const rows = orderedTabs(tabs, groups, profileId);
        const others = tabs.filter((tab) => tab.profileId !== profileId);
        for (const [index, row] of rows.entries()) {
          const [tab] = rowTabs(row);
          if (tab === undefined) {
            continue;
          }
          const still = moveTab(tabs, groups, tab.id, index);
          expect(orderedTabs(still, groups, profileId)).toStrictEqual(rows);
          expect(
            order(moveTab(tabs, groups, tab.id, rows.length + 5), profileId)
          ).toStrictEqual(
            order(moveTab(tabs, groups, tab.id, rows.length - 1), profileId)
          );
          expect(
            order(moveTab(tabs, groups, tab.id, -5), profileId)
          ).toStrictEqual(order(moveTab(tabs, groups, tab.id, 0), profileId));
          const moved = moveTab(tabs, groups, tab.id, rows.length);
          expect(order(moved, profileId).toSorted()).toStrictEqual(
            flat(rows).toSorted()
          );
          expect(
            moved.filter((found) => found.profileId !== profileId)
          ).toStrictEqual(others);
        }
      }
    }
  );
});

const profileOf = (id: string, order: number): Profile => ({
  id,
  label: id,
  order,
  status: { kind: "ok" },
});

const idsOf = (profiles: readonly Profile[]) =>
  profiles.map((profile) => profile.id);

describe(orderedProfiles, () => {
  it("orders by order, then by id for a tie", () => {
    expect(
      idsOf(
        orderedProfiles([
          profileOf("c", 2),
          profileOf("b", 0),
          profileOf("a", 0),
        ])
      )
    ).toStrictEqual(["a", "b", "c"]);
  });
});

describe(moveProfile, () => {
  const profiles = [profileOf("a", 0), profileOf("b", 4), profileOf("c", 9)];

  it("moves a profile and numbers the orders from 0", () => {
    expect(moveProfile(profiles, "c", 0)).toStrictEqual([
      profileOf("c", 0),
      profileOf("a", 1),
      profileOf("b", 2),
    ]);
  });

  it("clamps across the end and is stable under a no-op move", () => {
    expect(moveProfile(profiles, "a", 99)).toStrictEqual(
      moveProfile(profiles, "a", 2)
    );
    expect(moveProfile(profiles, "b", -3)).toStrictEqual(
      moveProfile(profiles, "b", 0)
    );
    expect(idsOf(moveProfile(profiles, "b", 1))).toStrictEqual(["a", "b", "c"]);
    expect(idsOf(moveProfile(profiles, "missing", 0))).toStrictEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe(groupOf, () => {
  it("finds the group a tab is in", () => {
    const groups = [
      groupWith("g1", "a", ["t1"]),
      groupWith("g2", "a", ["t2", "t3"]),
    ];
    expect(groupOf("t3", groups)?.id).toBe("g2");
    expect(groupOf("t9", groups)).toBeUndefined();
  });
});
