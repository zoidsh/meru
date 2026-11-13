import { describe, expect, it } from "vitest";

import { migrate } from "./migrate.ts";

describe(migrate, () => {
  const ladder = [
    (data: unknown) => ({ from1: data }),
    (data: unknown) => ({ from2: data }),
  ];

  it("runs each step from the file's version to the current one", () => {
    expect(migrate("x", 1, 3, ladder)).toStrictEqual({
      ok: true,
      value: { from2: { from1: "x" } },
    });
    expect(migrate("x", 2, 3, ladder)).toStrictEqual({
      ok: true,
      value: { from2: "x" },
    });
    expect(migrate("x", 3, 3, ladder)).toStrictEqual({ ok: true, value: "x" });
  });

  it("refuses a newer file and reports a step that threw", () => {
    expect(migrate("x", 4, 3, ladder)).toStrictEqual({
      error: "newer",
      ok: false,
    });
    expect(
      migrate("x", 1, 2, [
        () => {
          throw new Error("bad");
        },
      ])
    ).toStrictEqual({ error: "failed", ok: false });
  });
});
