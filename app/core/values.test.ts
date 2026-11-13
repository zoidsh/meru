import { describe, expect, it } from "vitest";
import { z } from "zod";

import { clamp, isEqual, messageOf, pick } from "./values.ts";

describe(clamp, () => {
  it("keeps a value within its bounds", () => {
    expect([clamp(-1, 0, 10), clamp(5, 0, 10), clamp(11, 0, 10)]).toStrictEqual(
      [0, 5, 10]
    );
  });
});

describe(isEqual, () => {
  it("compares JSON values by structure, whatever the key order", () => {
    expect(
      isEqual({ a: [1, { b: 2 }], c: null }, { c: null, a: [1, { b: 2 }] })
    ).toBeTruthy();
  });

  it("tells apart values that differ in a key, a length or a type", () => {
    expect([
      isEqual({ a: 1 }, { a: 2 }),
      isEqual({ a: 1 }, { a: 1, b: undefined }),
      isEqual([1, 2], [1]),
      isEqual([], {}),
      isEqual("1", 1),
    ]).toStrictEqual([false, false, false, false, false]);
  });
});

describe(pick, () => {
  it("parses the value at a key, and is undefined for anything else", () => {
    expect([
      pick({ id: "a" }, "id", z.string()),
      pick({ id: 1 }, "id", z.string()),
      pick(["a"], "0", z.string()),
      pick(null, "id", z.string()),
    ]).toStrictEqual(["a", undefined, undefined, undefined]);
  });
});

describe(messageOf, () => {
  it("takes an error's message and stringifies anything else", () => {
    expect([messageOf(new Error("boom")), messageOf(42)]).toStrictEqual([
      "boom",
      "42",
    ]);
  });
});
