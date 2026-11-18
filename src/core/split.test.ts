import { describe, expect, it } from "vitest";

import { APPS, findApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { paneTabs as paneTabsOf } from "./pane-tree.ts";
import type { PaneTree, Split } from "./pane-tree.ts";
import {
  boxOrder,
  evenedSplit,
  isMaximized,
  resizedSplit,
  shownPanes,
  splitBeside,
  splitFits,
  splitPanes,
  splitRoomy,
  splitTarget,
  splitWith,
  withBoxMove,
  withMaximized,
  withoutPane,
} from "./split.ts";
import { decodeState, encodeState, gmailTab, newProfile } from "./state.ts";
import type { Profile, State, Tab } from "./state.ts";
import {
  closeTab,
  maximizePane,
  moveInBox,
  moveTab,
  openTab,
  resizeSplit,
  separateTab,
  splitOntoTab,
  splitTab,
} from "./tabs.ts";
import { planViews } from "./views.ts";

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

describe(boxOrder, () => {
  it("lists the split's pinned tabs first in their pin order, then the rest in reading order, whichever tab is selected", () => {
    const tabs = [
      tab("a"),
      { ...tab("b"), pinned: true },
      tab("c"),
      { ...tab("d"), pinned: true },
      later,
    ];
    const nested: Split = {
      root: {
        direction: "row",
        children: [
          { size: 0.4, pane: row("c", "x") },
          {
            size: 0.4,
            pane: {
              direction: "column",
              children: [
                { size: 0.5, pane: "d" },
                { size: 0.5, pane: "a" },
              ],
            },
          },
          { size: 0.2, pane: "b" },
        ],
      },
    };

    expect([
      boxOrder(profile("gmail", nested, tabs)),
      boxOrder(profile("a", split("c", "a"), tabs)),
    ]).toStrictEqual([
      ["b", "d", "c", "a"],
      ["c", "a"],
    ]);
  });

  it("is none without a split, or with fewer than two of its tabs shown", () => {
    expect([
      boxOrder(profile("a")),
      boxOrder(profile("a", split("a", "x"), [tab("a"), later])),
    ]).toStrictEqual([undefined, undefined]);
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

const maximized = (...tabs: string[]): Split => ({
  ...split(...tabs),
  maximized: true,
});

const shares = (tree: PaneTree | undefined): unknown =>
  typeof tree === "object"
    ? tree.children.map((child) => [
        Math.round(child.size * 1000) / 1000,
        shares(child.pane),
      ])
    : tree;

describe(withMaximized, () => {
  it("shows the focused pane alone with the split kept, and all of them again", () => {
    const on = withMaximized(profile("b", split("a", "b")), true);

    expect([
      on?.split,
      on && shownPanes(on),
      on && splitPanes(on),
      on && withMaximized(on, false)?.split,
    ]).toStrictEqual([
      maximized("a", "b"),
      undefined,
      row("a", "b"),
      split("a", "b"),
    ]);
  });

  it("does nothing outside a split, or when it is already so", () => {
    expect([
      withMaximized(profile("c", split("a", "b")), true),
      withMaximized(profile("a"), true),
      withMaximized(profile("a", split("a", "b")), false),
      withMaximized(profile("a", maximized("a", "b")), true),
    ]).toStrictEqual([undefined, undefined, undefined, undefined]);
  });

  it("reads only true as maximized", () => {
    expect(
      [true, "yes", 1, undefined].map((value) =>
        isMaximized({ split: { ...split("a", "b"), maximized: value } })
      )
    ).toStrictEqual([true, false, false, false]);
  });
});

describe("a maximized split", () => {
  it("plans the focused pane's view alone, the others kept and hidden", () => {
    const current = state(profile("b", maximized("a", "b")));
    const planned = planViews(current, ["p/a", "p/b"], new Set(["p"]));

    expect([
      planned.front,
      planned.shown,
      planned.panes,
      planned.views.map(({ tabId }) => tabId),
    ]).toStrictEqual([key("b"), [key("b")], undefined, ["a", "b"]]);
  });

  it("selecting another of its tabs shows that one maximized", () => {
    const current = state(profile("a", maximized("a", "b")));

    expect(planViews(current, [], new Set(["p"])).shown).toStrictEqual([
      key("a"),
    ]);
  });

  it("is restored by a split, a separate and a close", () => {
    const current = state(profile("b", maximized("a", "b", "c")));

    expect([
      of(splitTab(current, key("d"), "row"))?.split?.maximized,
      of(separateTab(current, key("c")))?.split,
      of(closeTab(current, key("c")))?.split,
    ]).toStrictEqual([undefined, split("a", "b"), split("a", "b")]);
  });

  it("is restored while a tab outside the split is selected", () => {
    expect(
      of(
        maximizePane(state(profile("c", maximized("a", "b"))), key("a"), false)
      )
    ).toStrictEqual({ selected: "c", split: split("a", "b") });
  });

  it("is maximized and restored by its tab, which Maximize selects", () => {
    const current = state(profile("a", split("a", "b")));
    const on = maximizePane(current, key("b"), true);

    expect([
      of(on),
      on && of(maximizePane(on, key("a"), false)),
      maximizePane(current, key("c"), true),
    ]).toStrictEqual([
      { selected: "b", split: maximized("a", "b") },
      { selected: "b", split: split("a", "b") },
      undefined,
    ]);
  });

  it("comes back from the file maximized, and keeps what is not true as found", () => {
    const stored = (value: unknown) =>
      structuredClone(
        encodeState(
          state(profile("a", { ...split("a", "b"), maximized: value }))
        )
      );

    expect([
      of(readBack(stored(true)))?.split,
      of(readBack(stored("later")))?.split,
    ]).toStrictEqual([
      maximized("a", "b"),
      { ...split("a", "b"), maximized: "later" },
    ]);
  });
});

describe(resizedSplit, () => {
  const area = { width: 1008, height: 700 };

  it("moves the gap as it shows, from the gesture's start", () => {
    const base = split("a", "b");
    const current = profile("a", base);

    expect([
      shares(resizedSplit(current, base, area, "a", "b", 100)?.root),
      shares(resizedSplit(current, base, area, "a", "b", -2000)?.root),
    ]).toStrictEqual([
      [
        [0.6, "a"],
        [0.4, "b"],
      ],
      [
        [0.24, "a"],
        [0.76, "b"],
      ],
    ]);
  });

  it("leaves the share of a pane this build does not show as stored, and has no gap beside it", () => {
    const base = split("a", "x", "b");
    const current = profile("a", base, [tab("a"), tab("b"), later]);

    expect(resizedSplit(current, base, area, "a", "x", 100)).toBeUndefined();
    expect(
      shares(resizedSplit(current, base, area, "a", "b", 100)?.root)
    ).toStrictEqual([
      [0.4, "a"],
      [0.333, "x"],
      [0.267, "b"],
    ]);
  });

  it("keeps a maximized split's other keys", () => {
    const base = { ...maximized("a", "b"), later: 1 };

    expect(
      resizedSplit(profile("a", base), base, area, "a", "b", 100)
    ).toMatchObject({ maximized: true, later: 1 });
  });

  it("is nothing while the split does not show", () => {
    const base = split("a", "b");

    expect(
      resizedSplit(profile("c", base), base, area, "a", "b", 100)
    ).toBeUndefined();
  });
});

describe(evenedSplit, () => {
  it("evens out the split where the two part", () => {
    const uneven: Split = {
      root: {
        direction: "row",
        children: [
          { size: 0.7, pane: "a" },
          { size: 0.3, pane: "b" },
        ],
      },
    };

    expect(evenedSplit(uneven, "a", "b")).toStrictEqual(split("a", "b"));
  });
});

describe(resizeSplit, () => {
  const uneven: Split = {
    root: {
      direction: "row",
      children: [
        { size: 0.7, pane: "a" },
        { size: 0.3, pane: "b" },
      ],
    },
  };

  it("stores new sizes for the same panes, and nothing else", () => {
    const current = state(profile("a", split("a", "b")));

    expect([
      of(resizeSplit(current, "p", uneven))?.split,
      resizeSplit(current, "p", split("a", "b")),
      resizeSplit(current, "p", split("a", "c")),
      resizeSplit(state(profile("a")), "p", uneven),
    ]).toStrictEqual([uneven, undefined, undefined, undefined]);
  });

  it("stores them through the file", () => {
    const resized = resizeSplit(
      state(profile("a", split("a", "b"))),
      "p",
      uneven
    );

    expect(
      of(readBack(structuredClone(encodeState(resized as State))))?.split
    ).toStrictEqual(uneven);
  });
});

const leaves = (next: Profile | undefined) =>
  next?.split && paneTabsOf(next.split.root);

const order = (next: State | undefined) =>
  next?.profiles[0]?.tabs.flatMap((each) => ("id" in each ? [each.id] : []));

describe(splitBeside, () => {
  it("starts a split with the tab beside a lone target, on the side asked, selected", () => {
    expect([
      of(state(splitBeside(profile("a"), "b", "a", "row") as Profile)),
      of(state(splitBeside(profile("a"), "b", "c", "column", true) as Profile)),
    ]).toStrictEqual([
      { selected: "b", split: split("a", "b") },
      {
        selected: "b",
        split: {
          root: {
            direction: "column",
            children: [
              { size: 0.5, pane: "b" },
              { size: 0.5, pane: "c" },
            ],
          },
        },
      },
    ]);
  });

  it("puts the tab beside a target in the split, and moves a tab of the split there from its own pane", () => {
    expect([
      splitBeside(profile("a", split("a", "b")), "c", "b", "row")?.split,
      splitBeside(profile("a", split("a", "b", "c")), "a", "c", "row")?.split,
      splitBeside(profile("a", split("a", "b")), "a", "b", "row")?.split,
    ]).toStrictEqual([
      {
        root: {
          direction: "row",
          children: [
            { size: 0.5, pane: "a" },
            { size: 0.25, pane: "b" },
            { size: 0.25, pane: "c" },
          ],
        },
      },
      {
        root: {
          direction: "row",
          children: [
            { size: 0.5, pane: "b" },
            { size: 0.25, pane: "c" },
            { size: 0.25, pane: "a" },
          ],
        },
      },
      split("b", "a"),
    ]);
  });

  it("ends Maximize, which any change to the split does", () => {
    expect(
      splitBeside(
        profile("a", { ...split("a", "b"), maximized: true }),
        "c",
        "a",
        "row"
      )?.split?.maximized
    ).toBeUndefined();
  });

  it("refuses a tab put beside itself, a tab or target not shown, and a target outside the split while there is one", () => {
    expect([
      splitBeside(profile("a"), "a", "a", "row"),
      splitBeside(profile("a"), "gone", "a", "row"),
      splitBeside(profile("a"), "a", "gone", "row"),
      splitBeside(profile("a", split("a", "b")), "c", "d", "row"),
      splitBeside(profile("a", split("a", "b")), "a", "d", "row"),
    ]).toStrictEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe(splitRoomy, () => {
  it("fits every pane on screen at the minimum, and anything with no split on screen", () => {
    const three = profile("a", split("a", "b", "c"));

    expect([
      splitRoomy(three, { width: 736, height: 600 }),
      splitRoomy(three, { width: 735, height: 600 }),
      splitRoomy(profile("d", split("a", "b", "c")), {
        width: 100,
        height: 100,
      }),
    ]).toStrictEqual([true, false, true]);
  });
});

describe(withBoxMove, () => {
  const tabs = [tab("a"), tab("b"), tab("c"), { ...tab("p"), pinned: true }];
  const stored: Split = {
    root: {
      direction: "row",
      children: [
        { size: 0.2, pane: "a" },
        { size: 0.3, pane: "p" },
        {
          size: 0.5,
          pane: {
            direction: "column",
            children: [
              { size: 0.6, pane: "b" },
              { size: 0.4, pane: "c" },
            ],
          },
        },
      ],
    },
  };

  it("moves the tab among the box's unpinned tabs, the panes taking them in the new order with every split and size kept", () => {
    const moved = withBoxMove(profile("a", stored, tabs), "c", "a");

    expect([
      leaves(moved),
      leaves(withBoxMove(profile("a", stored, tabs), "a")),
      moved?.split?.root.children.map((child) => child.size),
    ]).toStrictEqual([
      ["c", "p", "a", "b"],
      ["b", "p", "c", "a"],
      [0.2, 0.3, 0.5],
    ]);
  });

  it("moves no pinned tab, nothing above one, and nothing to where it stands", () => {
    expect([
      withBoxMove(profile("a", stored, tabs), "p", "a"),
      withBoxMove(profile("a", stored, tabs), "a", "p"),
      withBoxMove(profile("a", stored, tabs), "a", "b"),
      withBoxMove(profile("a", stored, tabs), "c"),
      withBoxMove(profile("a", stored, tabs), "d"),
    ]).toStrictEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe("the sidebar's drops on a split", () => {
  it("splits a tab dropped onto another, the dragged one on the right; a pinned tab keeps its pin", () => {
    const pinned = [tab("a"), { ...tab("b"), pinned: true }];
    const next = splitOntoTab(
      state(profile("a", undefined, pinned)),
      key("b"),
      "a"
    );

    expect([
      of(next),
      next?.profiles[0]?.tabs.find((each) => "id" in each && each.id === "b"),
    ]).toStrictEqual([
      { selected: "b", split: split("a", "b") },
      { ...tab("b"), pinned: true },
    ]);
  });

  it("refuses a drop onto a tab outside the split while there is one", () => {
    expect(
      splitOntoTab(state(profile("a", split("a", "b"))), key("c"), "d")
    ).toBeUndefined();
  });

  it("moves a tab of the box among the others, its pane with it", () => {
    expect(
      of(moveInBox(state(profile("a", split("a", "b", "c"))), key("c"), "a"))
    ).toStrictEqual({ selected: "a", split: split("c", "a", "b") });
  });

  it("takes a tab moved out of the box out of the split, to its place in the list, above or below the box", () => {
    const three = state(profile("a", split("b", "c", "d")));

    expect([
      [
        order(moveTab(three, key("c"), "a")),
        of(moveTab(three, key("c"), "a"))?.split,
      ],
      [
        order(moveTab(three, key("b"), "b")),
        of(moveTab(three, key("b"), "b"))?.split,
      ],
      [order(moveTab(three, key("c"))), of(moveTab(three, key("c")))?.split],
    ]).toStrictEqual([
      [["gmail", "c", "a", "b", "d"], split("b", "d")],
      [["gmail", "a", "b", "c", "d"], split("c", "d")],
      [["gmail", "a", "b", "d", "c"], split("b", "d")],
    ]);
  });

  it("takes a pinned tab moved out of the box out of the split, pinned still", () => {
    const tabs = [tab("a"), { ...tab("b"), pinned: true }, tab("c")];
    const next = moveTab(state(profile("a", split("b", "c"), tabs)), key("b"));

    expect([
      of(next)?.split,
      next?.profiles[0]?.tabs.find((each) => "id" in each && each.id === "b"),
    ]).toStrictEqual([undefined, { ...tab("b"), pinned: true }]);
  });
});
