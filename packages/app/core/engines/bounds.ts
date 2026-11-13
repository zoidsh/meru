import type { Display } from "../ports.ts";
import type { Rect } from "../records/rect.ts";
import { clamp } from "./ordering.ts";

export const DEFAULT_WINDOW_SIZE = { height: 800, width: 1200 } as const;

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

const fit = (
  size: { readonly width: number; readonly height: number },
  area: Rect
) => ({
  height: Math.min(size.height, area.height),
  width: Math.min(size.width, area.width),
});

const centred = (
  size: { readonly width: number; readonly height: number },
  area: Rect
): Rect => {
  const { width, height } = fit(size, area);
  return {
    height,
    width,
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
  };
};

/**
 * Where a window opens: its saved bounds moved and shrunk into the display it mostly covers, centred on the primary display when it covers none, and the default size centred there when nothing was saved.
 */
export const clampToDisplay = (
  bounds: Rect | undefined,
  displays: readonly Display[],
  size: {
    readonly width: number;
    readonly height: number;
  } = DEFAULT_WINDOW_SIZE
): Rect => {
  const primary = displays.find((display) => display.primary) ?? displays[0];
  if (primary === undefined) {
    return bounds ?? { ...size, x: 0, y: 0 };
  }
  if (bounds === undefined) {
    return centred(size, primary.workArea);
  }
  const [best] = displays
    .map((display) => ({
      area: display.workArea,
      covered: overlap(bounds, display.workArea),
    }))
    .filter((found) => found.covered > 0)
    .toSorted((a, b) => b.covered - a.covered);
  if (best === undefined) {
    return centred(bounds, primary.workArea);
  }
  const { area } = best;
  const { width, height } = fit(bounds, area);
  return {
    height,
    width,
    x: clamp(bounds.x, area.x, area.x + area.width - width),
    y: clamp(bounds.y, area.y, area.y + area.height - height),
  };
};
