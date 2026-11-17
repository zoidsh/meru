import type { Rectangle, Size } from "./window-bounds.ts";

/** Main places the content view below it and the shell draws it this tall. */
export const TITLEBAR_HEIGHT = 40;

/** v3's wide strip, the one width until the settings that choose another. */
export const TAB_STRIP_WIDTH = 224;

export interface ViewFrame {
  /** Kept free around the view, below the titlebar and beside the strip. */
  inset: { top: number; right: number; bottom: number; left: number };
  radius: number;
}

/**
 * How the view sits in its area: inset from the window's right and bottom
 * edges, flush with the titlebar and the strip, with rounded corners. Main
 * places the view by it and the shell draws its chrome by it.
 */
export const viewFrame = (): ViewFrame => ({
  inset: { top: 0, right: 8, bottom: 8, left: 0 },
  radius: 8,
});

/** Where the content view sits in a window's content area. */
export const contentViewBounds = (
  contentSize: Size,
  stripWidth: number
): Rectangle => {
  const { inset } = viewFrame();
  const x = stripWidth + inset.left;
  const y = TITLEBAR_HEIGHT + inset.top;

  return {
    x,
    y,
    width: Math.max(0, contentSize.width - x - inset.right),
    height: Math.max(0, contentSize.height - y - inset.bottom),
  };
};

/**
 * Kept clear inside an overlay's view around what it draws, for its shadow,
 * since the view clips whatever falls outside it.
 */
export const OVERLAY_MARGIN = 20;

/**
 * Where an overlay of `size` sits: centred, `offset` below the top of the
 * content view, and no larger than what is left of it.
 */
export const overlayBounds = (
  contentSize: Size,
  stripWidth: number,
  size: Size,
  offset: number
): Rectangle => {
  const view = contentViewBounds(contentSize, stripWidth);
  const width = Math.min(size.width, view.width);

  return {
    x: view.x + Math.floor((view.width - width) / 2),
    y: view.y + offset,
    width,
    height: Math.max(0, Math.min(size.height, view.height - offset)),
  };
};
