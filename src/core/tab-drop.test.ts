import { describe, expect, it } from "vitest";

import { tabDrop } from "./tab-drop.ts";
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
      where(column, "gone", 30, 75),
    ]).toStrictEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
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
