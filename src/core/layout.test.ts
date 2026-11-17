import { describe, expect, it } from "vitest";

import {
  TAB_STRIP_WIDTH,
  contentViewBounds,
  overlayBounds,
  viewFrame,
} from "./layout.ts";

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

describe(overlayBounds, () => {
  it("sits at the top centre of the content view", () => {
    const size = { width: 1280, height: 800 };
    const view = contentViewBounds(size, TAB_STRIP_WIDTH, "modern");
    const bounds = overlayBounds(
      size,
      TAB_STRIP_WIDTH,
      "modern",
      { width: 400, height: 80 },
      8
    );

    expect(bounds).toStrictEqual({
      x: view.x + (view.width - 400) / 2,
      y: view.y + 8,
      width: 400,
      height: 80,
    });
    expect(
      overlayBounds(
        size,
        TAB_STRIP_WIDTH,
        "classic",
        { width: 400, height: 80 },
        8
      ).y
    ).toBe(48);
  });

  it("is no larger than the content view", () => {
    expect(
      overlayBounds(
        { width: 500, height: 100 },
        TAB_STRIP_WIDTH,
        "classic",
        { width: 400, height: 80 },
        8
      )
    ).toStrictEqual({ x: TAB_STRIP_WIDTH, y: 48, width: 276, height: 52 });
  });
});
