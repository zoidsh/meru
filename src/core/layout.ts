import type { Design } from "./settings.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/** Main places the content view below it and the shell draws it this tall. */
export const TITLEBAR_HEIGHT = 40;

/** v3's wide strip, the one width until the settings that choose another. */
export const TAB_STRIP_WIDTH = 224;

/** How far the modern design keeps the view from the strip and the window's edges. */
export const MODERN_INSET = 8;

/** The modern design's corner radius of the view. */
export const MODERN_RADIUS = 8;

export interface ViewFrame {
  /** Kept free around the view, below the titlebar and beside the strip. */
  inset: { top: number; right: number; bottom: number; left: number };
  radius: number;
}

/**
 * How the view sits in its area: edge to edge in classic, as in v3; in modern
 * inset from the strip and the window's sides and bottom, with rounded
 * corners. Main places the view by it and the shell draws its chrome by it.
 */
export const viewFrame = (design: Design): ViewFrame =>
  design === "modern"
    ? {
        inset: {
          top: 0,
          right: MODERN_INSET,
          bottom: MODERN_INSET,
          left: MODERN_INSET,
        },
        radius: MODERN_RADIUS,
      }
    : { inset: { top: 0, right: 0, bottom: 0, left: 0 }, radius: 0 };

/** Where the content view sits in a window's content area. */
export const contentViewBounds = (
  contentSize: Size,
  stripWidth: number,
  design: Design
): Rectangle => {
  const { inset } = viewFrame(design);
  const x = stripWidth + inset.left;
  const y = TITLEBAR_HEIGHT + inset.top;

  return {
    x,
    y,
    width: Math.max(0, contentSize.width - x - inset.right),
    height: Math.max(0, contentSize.height - y - inset.bottom),
  };
};
