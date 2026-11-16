import { describe, expect, it } from "vitest";

import { contentViewBounds } from "./layout.ts";

describe(contentViewBounds, () => {
  it("fills the window below the 40px titlebar", () => {
    expect(contentViewBounds({ width: 1280, height: 800 })).toStrictEqual({
      x: 0,
      y: 40,
      width: 1280,
      height: 760,
    });
  });

  it("never gives a negative size", () => {
    expect(contentViewBounds({ width: 0, height: 30 })).toStrictEqual({
      x: 0,
      y: 40,
      width: 0,
      height: 0,
    });
  });
});
