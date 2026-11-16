import { describe, expect, it } from "vitest";

import { resolveWindowBounds } from "./window-bounds.ts";
import type { Display, WindowBoundsInput } from "./window-bounds.ts";

const laptop: Display = {
  workArea: { x: 0, y: 25, width: 1440, height: 875 },
  primary: true,
};

/** A monitor to the left of the laptop, so its coordinates are negative. */
const monitor: Display = {
  workArea: { x: -1920, y: -180, width: 1920, height: 1080 },
  primary: false,
};

const resolve = (input: Partial<WindowBoundsInput>) =>
  resolveWindowBounds({
    saved: undefined,
    displays: [laptop],
    defaultSize: { width: 1280, height: 800 },
    minimumSize: { width: 320, height: 256 },
    ...input,
  });

describe(resolveWindowBounds, () => {
  it("keeps saved bounds that lie wholly on a display", () => {
    const saved = { x: 100, y: 100, width: 1000, height: 700 };

    expect(resolve({ saved })).toStrictEqual(saved);
  });

  it("moves saved bounds that hang off a display's edge back onto it", () => {
    expect(
      resolve({ saved: { x: 1000, y: 600, width: 800, height: 600 } })
    ).toStrictEqual({ x: 640, y: 300, width: 800, height: 600 });
  });

  it("moves saved bounds whose titlebar sits above the work area down into it", () => {
    expect(
      resolve({ saved: { x: 100, y: -50, width: 800, height: 600 } })
    ).toStrictEqual({ x: 100, y: 25, width: 800, height: 600 });
  });

  it("shrinks saved bounds larger than the display they are on", () => {
    expect(
      resolve({ saved: { x: -100, y: 0, width: 2000, height: 1200 } })
    ).toStrictEqual(laptop.workArea);
  });

  it("centres the default size on the primary display when saved bounds miss every display", () => {
    expect(
      resolve({ saved: { x: 5000, y: 5000, width: 1000, height: 700 } })
    ).toStrictEqual({ x: 80, y: 63, width: 1280, height: 800 });
  });

  it("centres the default size when there are no saved bounds", () => {
    expect(resolve({})).toStrictEqual({
      x: 80,
      y: 63,
      width: 1280,
      height: 800,
    });
  });

  it("centres the default size when saved bounds are below the minimum size", () => {
    expect(
      resolve({ saved: { x: 100, y: 100, width: 200, height: 700 } })
    ).toStrictEqual({ x: 80, y: 63, width: 1280, height: 800 });
    expect(
      resolve({ saved: { x: 100, y: 100, width: 700, height: 100 } })
    ).toStrictEqual({ x: 80, y: 63, width: 1280, height: 800 });
  });

  it("centres the default size when saved bounds are not numbers", () => {
    expect(
      resolve({ saved: { x: Number.NaN, y: 100, width: 700, height: 500 } })
    ).toStrictEqual({ x: 80, y: 63, width: 1280, height: 800 });
  });

  it("shrinks the default size to a primary display smaller than it", () => {
    const small: Display = {
      workArea: { x: 0, y: 0, width: 1024, height: 768 },
      primary: true,
    };

    expect(resolve({ displays: [small] })).toStrictEqual(small.workArea);
  });

  describe("with several displays", () => {
    const displays = [monitor, laptop];

    it("keeps saved bounds on a secondary display", () => {
      const saved = { x: -1800, y: -100, width: 1200, height: 800 };

      expect(resolve({ saved, displays })).toStrictEqual(saved);
    });

    it("moves bounds that straddle two displays onto the one they overlap most", () => {
      expect(
        resolve({
          saved: { x: -300, y: 100, width: 1000, height: 700 },
          displays,
        })
      ).toStrictEqual({ x: 0, y: 100, width: 1000, height: 700 });
      expect(
        resolve({
          saved: { x: -700, y: 100, width: 1000, height: 700 },
          displays,
        })
      ).toStrictEqual({ x: -1000, y: 100, width: 1000, height: 700 });
    });

    it("centres the default size on the primary display, wherever it is listed", () => {
      expect(
        resolve({
          saved: { x: 5000, y: 5000, width: 1000, height: 700 },
          displays,
        })
      ).toStrictEqual({ x: 80, y: 63, width: 1280, height: 800 });
    });

    it("centres the default size when the monitor the bounds were on is unplugged", () => {
      expect(
        resolve({
          saved: { x: -1800, y: -100, width: 1200, height: 800 },
          displays: [laptop],
        })
      ).toStrictEqual({ x: 80, y: 63, width: 1280, height: 800 });
    });
  });
});
