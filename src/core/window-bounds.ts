import { clamp } from "es-toolkit";

export interface Size {
  width: number;
  height: number;
}

export interface Rectangle extends Size {
  x: number;
  y: number;
}

export interface Display {
  /** The display's area minus the menu bar, dock or taskbar. */
  workArea: Rectangle;
  primary: boolean;
}

export interface WindowBoundsInput {
  /** What the window last had, read back from disk, so possibly nonsense. */
  saved: Rectangle | undefined;
  displays: readonly Display[];
  defaultSize: Size;
  minimumSize: Size;
}

const isFiniteRectangle = (rectangle: Rectangle) =>
  [rectangle.x, rectangle.y, rectangle.width, rectangle.height].every((value) =>
    Number.isFinite(value)
  );

const intersectionArea = (a: Rectangle, b: Rectangle) => {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  return width > 0 && height > 0 ? width * height : 0;
};

/** Shrinks `bounds` to fit `area` where it must, then keeps them inside it. */
const fitInto = (bounds: Rectangle, area: Rectangle): Rectangle => {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);

  return {
    x: clamp(bounds.x, area.x, area.x + area.width - width),
    y: clamp(bounds.y, area.y, area.y + area.height - height),
    width,
    height,
  };
};

const centreIn = (area: Rectangle, size: Size): Rectangle => {
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);

  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  };
};

const largestOverlap = (bounds: Rectangle, displays: readonly Display[]) => {
  let best: { display: Display; area: number } | undefined;

  for (const display of displays) {
    const area = intersectionArea(bounds, display.workArea);

    if (area > 0 && (!best || area > best.area)) {
      best = { display, area };
    }
  }

  return best?.display;
};

/**
 * Bounds for a window that lie wholly on one of the current displays.
 *
 * Saved bounds that still overlap a display are moved, and shrunk where they
 * have to be, onto the display they overlap most, so a window left half off a
 * screen comes back where it was but reachable. Bounds that miss every display,
 * as after unplugging the monitor they were on, or that are smaller than the
 * window's minimum, give way to the default size centred on the primary display.
 */
export const resolveWindowBounds = ({
  saved,
  displays,
  defaultSize,
  minimumSize,
}: WindowBoundsInput): Rectangle => {
  const primary = displays.find((display) => display.primary) ?? displays[0];

  if (!primary) {
    return { x: 0, y: 0, ...defaultSize };
  }

  const fallback = centreIn(primary.workArea, defaultSize);

  if (
    !saved ||
    !isFiniteRectangle(saved) ||
    saved.width < minimumSize.width ||
    saved.height < minimumSize.height
  ) {
    return fallback;
  }

  const display = largestOverlap(saved, displays);

  return display ? fitInto(saved, display.workArea) : fallback;
};
