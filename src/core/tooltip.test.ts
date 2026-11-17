import { describe, expect, it } from "vitest";

import { tooltipRectangle, tooltipViewBounds } from "./tooltip.ts";

const AREA = { width: 1000, height: 600 };
const BUTTON = { x: 100, y: 8, width: 28, height: 28 };
const SIZE = { width: 60, height: 26 };

describe(tooltipRectangle, () => {
  it("sits 4px past the anchor on its side, centred on it", () => {
    expect(tooltipRectangle(BUTTON, SIZE, "bottom", AREA)).toStrictEqual({
      x: 84,
      y: 40,
      width: 60,
      height: 26,
    });
    expect(tooltipRectangle(BUTTON, SIZE, "right", AREA)).toStrictEqual({
      x: 132,
      y: 9,
      width: 60,
      height: 26,
    });
    expect(
      tooltipRectangle({ ...BUTTON, x: 300, y: 300 }, SIZE, "left", AREA).x
    ).toBe(236);
    expect(tooltipRectangle({ ...BUTTON, y: 300 }, SIZE, "top", AREA).y).toBe(
      270
    );
  });

  it("shifts along its side to stay 4px inside the area", () => {
    expect(tooltipRectangle({ ...BUTTON, x: 2 }, SIZE, "bottom", AREA).x).toBe(
      4
    );
    expect(
      tooltipRectangle({ ...BUTTON, x: 980 }, SIZE, "bottom", AREA).x
    ).toBe(936);
    expect(tooltipRectangle(BUTTON, SIZE, "right", AREA).y).toBe(9);
    expect(tooltipRectangle({ ...BUTTON, y: 590 }, SIZE, "right", AREA).y).toBe(
      570
    );
  });

  it("rounds to whole pixels, the size up", () => {
    expect(
      tooltipRectangle(BUTTON, { width: 59.2, height: 25.5 }, "bottom", AREA)
    ).toStrictEqual({ x: 84, y: 40, width: 60, height: 26 });
  });
});

describe(tooltipViewBounds, () => {
  it("leaves 8px around the tooltip for its arrow, inside the area", () => {
    expect(
      tooltipViewBounds({ x: 84, y: 40, width: 60, height: 26 }, AREA)
    ).toStrictEqual({ x: 76, y: 32, width: 76, height: 42 });
    expect(
      tooltipViewBounds({ x: 4, y: 4, width: 60, height: 26 }, AREA)
    ).toStrictEqual({ x: 0, y: 0, width: 72, height: 38 });
    expect(
      tooltipViewBounds({ x: 936, y: 570, width: 60, height: 26 }, AREA)
    ).toStrictEqual({ x: 928, y: 562, width: 72, height: 38 });
  });
});
