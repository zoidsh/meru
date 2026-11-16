import { describe, expect, it } from "vitest";

import { TAB_STRIP_WIDTH, contentViewBounds, viewFrame } from "./layout.ts";

describe(contentViewBounds, () => {
  it("in classic fills the window below the 40px titlebar and beside the strip", () => {
    expect(
      contentViewBounds(
        { width: 1280, height: 800 },
        TAB_STRIP_WIDTH,
        "classic"
      )
    ).toStrictEqual({ x: 224, y: 40, width: 1056, height: 760 });
  });

  it("in modern keeps 8px from the strip, the window's right edge and its bottom", () => {
    expect(
      contentViewBounds({ width: 1280, height: 800 }, TAB_STRIP_WIDTH, "modern")
    ).toStrictEqual({ x: 232, y: 40, width: 1040, height: 752 });
  });

  it("never gives a negative size", () => {
    for (const design of ["classic", "modern"] as const) {
      const bounds = contentViewBounds({ width: 100, height: 30 }, 224, design);

      expect([bounds.width, bounds.height]).toStrictEqual([0, 0]);
    }
  });
});

describe(viewFrame, () => {
  it("rounds the view's corners in modern alone", () => {
    expect(viewFrame("modern").radius).toBe(8);
    expect(viewFrame("classic").radius).toBe(0);
  });
});
