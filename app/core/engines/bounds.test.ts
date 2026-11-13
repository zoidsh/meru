import { describe, expect, it } from "vitest";

import type { Display } from "../ports.ts";
import { clampToDisplay, DEFAULT_WINDOW_SIZE } from "./bounds.ts";

const primary: Display = {
  primary: true,
  workArea: { height: 1055, width: 1920, x: 0, y: 25 },
};
// A second display to the right of the primary, its top lower.
const side: Display = {
  primary: false,
  workArea: { height: 1440, width: 2560, x: 1920, y: 200 },
};
const displays = [side, primary];

describe(clampToDisplay, () => {
  it("keeps bounds that lie inside a display", () => {
    const bounds = { height: 600, width: 800, x: 2100, y: 400 };
    expect(clampToDisplay(bounds, displays)).toStrictEqual(bounds);
  });

  it("brings a window that is fully off-screen back to the primary display, centred", () => {
    expect(
      clampToDisplay({ height: 600, width: 800, x: -5000, y: 9000 }, displays)
    ).toStrictEqual({ height: 600, width: 800, x: 560, y: 252 });
  });

  it("shifts a window that is partly off-screen into the display it mostly covers", () => {
    expect(
      clampToDisplay({ height: 600, width: 800, x: 1700, y: 1500 }, displays)
    ).toStrictEqual({ height: 600, width: 800, x: 1920, y: 1040 });
    expect(
      clampToDisplay({ height: 600, width: 800, x: -100, y: 0 }, displays)
    ).toStrictEqual({ height: 600, width: 800, x: 0, y: 25 });
  });

  it("shrinks a window larger than its display to the display", () => {
    expect(
      clampToDisplay({ height: 3000, width: 3000, x: 10, y: 30 }, [primary])
    ).toStrictEqual(primary.workArea);
  });

  it("opens at the default size, centred on the primary display, when nothing was saved", () => {
    expect(clampToDisplay(undefined, displays)).toStrictEqual({
      ...DEFAULT_WINDOW_SIZE,
      x: 360,
      y: 152,
    });
    expect(clampToDisplay(undefined, [])).toStrictEqual({
      ...DEFAULT_WINDOW_SIZE,
      x: 0,
      y: 0,
    });
  });
});
