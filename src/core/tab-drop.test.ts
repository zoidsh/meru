import { describe, expect, it } from "vitest";

import { sidebarDrop, tabDrop } from "./tab-drop.ts";
import type { DropTile } from "./tab-drop.ts";

const tile = (
  id: string,
  left: number,
  top: number,
  width = 32,
  height = 32
): DropTile => ({
  id,
  box: { left, top, right: left + width, bottom: top + height },
});

/** Three tiles down a column, 32px each with 8px between. */
const column = [tile("a", 16, 0), tile("b", 16, 40), tile("c", 16, 80)];

/** Two tiles side by side, 8px apart, and one below spanning the row. */
const grid = [tile("a", 0, 0, 60), tile("b", 68, 0, 60), tile("c", 0, 36, 128)];

const where = (
  tiles: readonly DropTile[],
  dragged: string,
  x: number,
  y: number
) => {
  const drop = tabDrop(tiles, dragged, { x, y });

  return drop && [drop.before ?? "end", drop.line];
};

describe(tabDrop, () => {
  it("lands a tab in a column between two items by the nearer end of the one under the pointer, or in the gap", () => {
    expect([
      where(column, "a", 30, 75),
      where(column, "a", 30, 110),
      where(column, "c", 30, 2),
      where(column, "c", 30, -20),
      where(column, "a", 30, 300),
    ]).toStrictEqual([
      ["c", { left: 13, top: 75, right: 51, bottom: 77 }],
      ["end", { left: 13, top: 115, right: 51, bottom: 117 }],
      ["a", { left: 13, top: -5, right: 51, bottom: -3 }],
      ["a", { left: 13, top: -5, right: 51, bottom: -3 }],
      ["end", { left: 13, top: 115, right: 51, bottom: 117 }],
    ]);
  });

  it("lands nothing over the middle of a tile, nor in the tab's own place", () => {
    expect([
      where(column, "a", 30, 56),
      where(column, "a", 30, 2),
      where(column, "a", 30, 38),
      where(column, "a", 30, 42),
      where(column, "b", 30, 70),
    ]).toStrictEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it("lands a tab from outside the tiles anywhere between them, having no place of its own", () => {
    expect([
      where(column, "", 30, 38),
      where(column, "", 30, 75),
    ]).toStrictEqual([
      ["b", { left: 13, top: 35, right: 51, bottom: 37 }],
      ["c", { left: 13, top: 75, right: 51, bottom: 77 }],
    ]);
  });

  it("lands a tab in a row of tiles beside one, down between them, and across above a tile that spans the row", () => {
    expect([
      where(grid, "c", 5, 16),
      where(grid, "c", 64, 16),
      where(grid, "a", 125, 16),
      where(grid, "a", 20, 40),
      where(grid, "a", 60, 66),
    ]).toStrictEqual([
      ["a", { left: -5, top: 0, right: -3, bottom: 32 }],
      ["b", { left: 63, top: 0, right: 65, bottom: 32 }],
      ["c", { left: 131, top: 0, right: 133, bottom: 32 }],
      ["c", { left: -3, top: 33, right: 131, bottom: 35 }],
      ["end", { left: -3, top: 69, right: 131, bottom: 71 }],
    ]);
  });
});

describe(sidebarDrop, () => {
  // a, then the box of b and c, then the box of e and f, then d, down a
  // 32px-wide list.
  const a = tile("a", 16, 0);
  const b = tile("b", 16, 46);
  const c = tile("c", 16, 86);
  const e = tile("e", 16, 138);
  const f = tile("f", 16, 178);
  const d = tile("d", 16, 228);
  const boxes = [
    { box: { left: 13, top: 40, right: 51, bottom: 124 }, rows: [b, c] },
    { box: { left: 13, top: 132, right: 51, bottom: 216 }, rows: [e, f] },
  ];
  const tabs = [
    { ...a, inBox: undefined },
    { ...b, inBox: 0 },
    { ...c, inBox: 0 },
    { ...e, inBox: 1 },
    { ...f, inBox: 1 },
    { ...d, inBox: undefined },
  ];
  const area = [
    a,
    { id: "b", box: boxes[0]?.box ?? a.box },
    { id: "e", box: boxes[1]?.box ?? a.box },
    d,
  ];
  const drop = (
    id: string,
    y: number,
    { inBox = undefined as number | undefined, pinned = false } = {}
  ) => {
    const result = sidebarDrop({
      dragged: { id, pinned, inBox },
      point: { x: 30, y },
      tabs,
      boxes,
      area,
    });

    return (
      result && [
        result.kind,
        "target" in result ? result.target : (result.before ?? "end"),
      ]
    );
  };

  it("rings a tab under the middle of the pointer, in a box or not, a tab of another box included", () => {
    expect([
      drop("a", 244),
      drop("a", 100),
      drop("d", 60),
      drop("b", 194, { inBox: 0 }),
      drop("e", 16, { inBox: 1 }),
    ]).toStrictEqual([
      ["onto", "d"],
      ["onto", "c"],
      ["onto", "b"],
      ["onto", "f"],
      ["onto", "a"],
    ]);
  });

  it("in a box, rings only its tabs, a line above it landing outside", () => {
    expect([drop("a", 128), drop("a", 174)]).toStrictEqual([
      ["move", "e"],
      undefined,
    ]);
  });

  it("moves a tab of a box among its tabs by an inset line, and a pinned one of it not at all", () => {
    expect([
      drop("c", 50, { inBox: 0 }),
      drop("b", 110, { inBox: 0 }),
      drop("b", 60, { inBox: 0 }),
      drop("b", 110, { inBox: 0, pinned: true }),
      drop("f", 142, { inBox: 1 }),
    ]).toStrictEqual([
      ["box", "b"],
      ["box", "end"],
      undefined,
      undefined,
      ["box", "e"],
    ]);
  });

  it("moves a tab of a box out of it by a line outside it: above it, between two boxes, below them and at the end", () => {
    expect([
      drop("b", 2, { inBox: 0 }),
      drop("b", 42, { inBox: 0 }),
      drop("c", 128, { inBox: 0 }),
      drop("f", 222, { inBox: 1 }),
      drop("c", 300, { inBox: 0 }),
    ]).toStrictEqual([
      ["move", "a"],
      ["move", "b"],
      ["move", "e"],
      ["move", "d"],
      ["move", "end"],
    ]);
  });

  it("moves a tab outside past each box as past one place, between two boxes included", () => {
    expect([drop("a", 128), drop("d", 42), drop("d", 128)]).toStrictEqual([
      ["move", "e"],
      ["move", "b"],
      ["move", "e"],
    ]);
  });
});

describe("sidebarDrop with the box all the pinned area holds", () => {
  // The box of pinned a and b first in the pinned area, with no list
  // drawn, then New tab at 200.
  const a = tile("a", 16, 6);
  const b = tile("b", 16, 46);
  const box = { left: 13, top: 0, right: 51, bottom: 84 };
  const tabs = [
    { ...a, inBox: 0 },
    { ...b, inBox: 0 },
  ];
  const noList = {
    below: { left: 0, top: 92, right: 64, bottom: 400 },
    next: { left: 16, top: 200, right: 48, bottom: 232 },
  };
  const drop = (pinned: boolean, y: number, withArea = true) =>
    sidebarDrop({
      dragged: { id: "b", pinned, inBox: 0 },
      point: { x: 30, y },
      tabs,
      boxes: [{ box, rows: pinned ? [] : [b] }],
      area: withArea ? [] : undefined,
      noList: pinned ? undefined : noList,
    });

  it("moves a pinned tab of it to the pinned area's end, by a line below the box", () => {
    expect(drop(true, 150)).toStrictEqual({
      kind: "move",
      before: undefined,
      line: { left: 10, top: 87, right: 54, bottom: 89 },
    });
  });

  it("moves a tab not pinned out to the list's end, by a line above the button after it, only below the pinned area", () => {
    expect([drop(false, 150, false), drop(false, 40, false)]).toStrictEqual([
      {
        kind: "move",
        before: undefined,
        line: { left: 13, top: 145, right: 51, bottom: 147 },
      },
      undefined,
    ]);
  });
});
