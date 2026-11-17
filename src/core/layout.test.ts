import { describe, expect, it } from "vitest";

import { contentViewBounds, viewFrame } from "./layout.ts";

const WINDOW = { width: 1280, height: 800 };

describe(contentViewBounds, () => {
  it("sits flush below the 40px titlebar and beside the sidebar, 8px from the window's right edge and its bottom", () => {
    expect([
      contentViewBounds(WINDOW, "narrow"),
      contentViewBounds(WINDOW, "wide"),
    ]).toStrictEqual([
      { x: 64, y: 40, width: 1208, height: 752 },
      { x: 224, y: 40, width: 1048, height: 752 },
    ]);
  });

  it("keeps 8px from the window's left edge too while the sidebar is hidden", () => {
    expect(contentViewBounds(WINDOW, "hidden")).toStrictEqual({
      x: 8,
      y: 40,
      width: 1264,
      height: 752,
    });
  });

  it("never gives a negative size", () => {
    const bounds = contentViewBounds({ width: 100, height: 30 }, "wide");

    expect([bounds.width, bounds.height]).toStrictEqual([0, 0]);
  });
});

describe(viewFrame, () => {
  it("rounds the view's corners by 8px", () => {
    expect(viewFrame("wide").radius).toBe(8);
  });
});
