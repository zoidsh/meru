import { describe, expect, it } from "vitest";

import { clamp, moveItem } from "./ordering.ts";

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
