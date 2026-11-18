import { describe, expect, it } from "vitest";

import { menuItem, menuOfGroups, menuPointInside } from "./context-menu.ts";

describe(menuOfGroups, () => {
  it("puts a line between each two groups, leaving an empty group out", () => {
    const a = { kind: "item", id: "a", enabled: true } as const;
    const b = { kind: "item", id: "b", enabled: false } as const;

    expect(menuOfGroups([[], [a], [], [b, a]])).toStrictEqual([
      a,
      { kind: "separator" },
      b,
      a,
    ]);
  });
});

describe(menuItem, () => {
  it("finds an item by id, and none in no menu", () => {
    const a = { kind: "item", id: "a", enabled: true } as const;

    expect([
      menuItem([{ kind: "separator" }, a], "a"),
      menuItem([a], "b" as "a"),
      menuItem(undefined, "a"),
    ]).toStrictEqual([a, undefined, undefined]);
  });
});

describe(menuPointInside, () => {
  it("takes a whole point of the content area, its edges included", () => {
    const size = { width: 100, height: 50 };

    expect(
      [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
        { x: 101, y: 0 },
        { x: 0, y: -1 },
        { x: 0.5, y: 0 },
      ].map((point) => menuPointInside(point, size))
    ).toStrictEqual([true, true, false, false, false]);
  });
});
