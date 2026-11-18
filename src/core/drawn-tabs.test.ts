import { describe, expect, it } from "vitest";

import {
  drawnTabs,
  listRoom,
  moveStep,
  sidebarLayout,
  sideways,
  spansPinnedRow,
} from "./drawn-tabs.ts";
import type { SidebarItem } from "./drawn-tabs.ts";
import { gmailTab, newProfile } from "./state.ts";
import type { Tab } from "./state.ts";

const tab = (id: string, pinned = false) => ({ id, pinned });

const names = (items: SidebarItem<{ id: string }>[]) =>
  items.map((item) =>
    item.kind === "box"
      ? `[${item.tabs.map(({ id }) => id).join(" ")}]`
      : item.tab.id
  );

const layout = (...boxes: string[][]) => {
  const { pinned, listed } = sidebarLayout(
    [
      tab("g", true),
      tab("p", true),
      tab("q", true),
      tab("a"),
      tab("b"),
      tab("c"),
      tab("n"),
    ],
    boxes
  );

  return [names(pinned), names(listed)];
};

describe(sidebarLayout, () => {
  it("puts the box in the list where its first tab stands, in its own order", () => {
    expect(layout(["n", "b"])).toStrictEqual([
      ["g", "p", "q"],
      ["a", "[n b]", "c"],
    ]);
  });

  it("puts each box in the list where its first tab stands, two side by side included", () => {
    expect([
      layout(["n", "b"], ["c", "a"]),
      layout(["b", "a"], ["n", "c"]),
    ]).toStrictEqual([
      [
        ["g", "p", "q"],
        ["[c a]", "[n b]"],
      ],
      [
        ["g", "p", "q"],
        ["[b a]", "[n c]"],
      ],
    ]);
  });

  it("puts every box holding a pinned tab first in the pinned area, in the splits' order", () => {
    expect([
      layout(["q", "c"], ["p", "a"]),
      layout(["q", "c"], ["n", "a"]),
    ]).toStrictEqual([
      [
        ["[q c]", "[p a]", "g"],
        ["b", "n"],
      ],
      [
        ["[q c]", "g", "p"],
        ["[n a]", "b"],
      ],
    ]);
  });

  it("gives each drawn box's tabs in its own order, leaving out one not drawn", () => {
    const tabs = [tab("g", true), tab("a"), tab("b"), tab("c"), tab("d")];

    expect(
      sidebarLayout(tabs, [
        ["b", "a"],
        ["c", "gone"],
        ["d", "c"],
      ]).boxes.map((box) => box.map(({ id }) => id))
    ).toStrictEqual([
      ["b", "a"],
      ["d", "c"],
    ]);
  });

  it("draws no box for none, or for fewer than two of its tabs shown", () => {
    expect([layout(), layout(["a", "gone"])]).toStrictEqual([
      [
        ["g", "p", "q"],
        ["a", "b", "c", "n"],
      ],
      [
        ["g", "p", "q"],
        ["a", "b", "c", "n"],
      ],
    ]);
  });
});

const listedTab = (id: string, app = "calendar"): Tab => ({
  id,
  app,
  url: "",
  title: id,
});

describe(drawnTabs, () => {
  it("is the profile's shown tabs top to bottom as the sidebar draws them, a box in each area", () => {
    expect(
      drawnTabs({
        ...newProfile("p", "Default"),
        tabs: [
          gmailTab(),
          listedTab("a"),
          listedTab("b"),
          listedTab("x", "later"),
          listedTab("c"),
          listedTab("n", "drive"),
        ],
        splits: [
          {
            root: {
              direction: "row",
              children: [
                { size: 0.5, pane: "c" },
                { size: 0.5, pane: "gmail" },
              ],
            },
          },
          {
            root: {
              direction: "row",
              children: [
                { size: 0.5, pane: "a" },
                { size: 0.5, pane: "n" },
              ],
            },
          },
        ],
      }).map(({ id }) => id)
    ).toStrictEqual(["gmail", "c", "a", "n", "b"]);
  });
});

describe(spansPinnedRow, () => {
  it("spans the row with the last tile of an odd count alone", () => {
    expect(
      [1, 2, 3, 4].map((count) =>
        Array.from({ length: count }, (_, index) =>
          spansPinnedRow(index, count)
        )
      )
    ).toStrictEqual([
      [true],
      [false, false],
      [false, false, true],
      [false, false, false, false],
    ]);
  });
});

describe(listRoom, () => {
  it("keeps room for up to three tabs and the inset above the first", () => {
    expect([0, 1, 2, 3, 4].map((count) => listRoom(count, 8))).toStrictEqual([
      0, 38, 78, 118, 118,
    ]);
    expect(listRoom(2, 4)).toBe(74);
  });
});

describe(sideways, () => {
  it("goes to the other tile of the row, never across rows", () => {
    expect(sideways(0, "ArrowRight")).toBe(1);
    expect(sideways(1, "ArrowLeft")).toBe(0);
    expect(sideways(1, "ArrowRight")).toBeUndefined();
    expect(sideways(2, "ArrowLeft")).toBeUndefined();
  });
});

const press = (
  key: string,
  modifiers: Partial<Record<string, boolean>> = {}
) => ({
  key,
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...modifiers,
});

describe(moveStep, () => {
  it("moves a place back or on with Alt and Up or Down", () => {
    expect(moveStep(press("ArrowUp"), false)).toBe(-1);
    expect(moveStep(press("ArrowDown"), false)).toBe(1);
    expect(moveStep(press("ArrowLeft"), false)).toBeUndefined();
  });

  it("takes Left and Right too in the wide pinned grid", () => {
    expect(moveStep(press("ArrowLeft"), true)).toBe(-1);
    expect(moveStep(press("ArrowRight"), true)).toBe(1);
  });

  it("leaves an arrow without Alt, or with another modifier, alone", () => {
    expect(
      moveStep(press("ArrowUp", { altKey: false }), false)
    ).toBeUndefined();
    expect(
      moveStep(press("ArrowUp", { shiftKey: true }), false)
    ).toBeUndefined();
    expect(moveStep(press("ArrowUp", { metaKey: true }), true)).toBeUndefined();
  });
});
