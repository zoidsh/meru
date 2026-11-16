import { describe, expect, it } from "vitest";

import { TAB_STRIP_WIDTH, contentViewBounds } from "./layout.ts";

describe(contentViewBounds, () => {
  it("fills the window below the 40px titlebar and beside the strip", () => {
    expect(
      contentViewBounds({ width: 1280, height: 800 }, TAB_STRIP_WIDTH)
    ).toStrictEqual({ x: 224, y: 40, width: 1056, height: 760 });
  });

  it("never gives a negative size", () => {
    expect(contentViewBounds({ width: 100, height: 30 }, 224)).toStrictEqual({
      x: 224,
      y: 40,
      width: 0,
      height: 0,
    });
  });
});
