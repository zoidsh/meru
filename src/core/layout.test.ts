import { describe, expect, it } from "vitest";

import {
  TAB_STRIP_WIDTH,
  contentViewBounds,
  overlayBounds,
  viewFrame,
} from "./layout.ts";

describe(contentViewBounds, () => {
  it("sits flush below the 40px titlebar and beside the strip, 8px from the window's right edge and its bottom", () => {
    expect(
      contentViewBounds({ width: 1280, height: 800 }, TAB_STRIP_WIDTH)
    ).toStrictEqual({ x: 224, y: 40, width: 1048, height: 752 });
  });

  it("never gives a negative size", () => {
    const bounds = contentViewBounds({ width: 100, height: 30 }, 224);

    expect([bounds.width, bounds.height]).toStrictEqual([0, 0]);
  });
});

describe(viewFrame, () => {
  it("rounds the view's corners by 8px", () => {
    expect(viewFrame().radius).toBe(8);
  });
});

describe(overlayBounds, () => {
  it("sits at the top centre of the content view", () => {
    const size = { width: 1280, height: 800 };
    const view = contentViewBounds(size, TAB_STRIP_WIDTH);

    expect(
      overlayBounds(size, TAB_STRIP_WIDTH, { width: 400, height: 80 }, 8)
    ).toStrictEqual({
      x: view.x + (view.width - 400) / 2,
      y: 48,
      width: 400,
      height: 80,
    });
  });

  it("is no larger than the content view", () => {
    expect(
      overlayBounds(
        { width: 500, height: 100 },
        TAB_STRIP_WIDTH,
        { width: 400, height: 80 },
        8
      )
    ).toStrictEqual({ x: TAB_STRIP_WIDTH, y: 48, width: 268, height: 44 });
  });
});
