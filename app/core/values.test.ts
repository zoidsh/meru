import { describe, expect, it } from "vitest";
import { z } from "zod";

import { messageOf, parseField } from "./values.ts";

describe(parseField, () => {
  it("parses the value at a key, and is undefined for anything else", () => {
    expect([
      parseField({ id: "a" }, "id", z.string()),
      parseField({ id: 1 }, "id", z.string()),
      parseField(["a"], "0", z.string()),
      parseField(null, "id", z.string()),
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
