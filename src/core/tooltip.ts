import { clamp } from "es-toolkit";

import type { Rectangle, Size } from "./window-bounds.ts";

export const TOOLTIP_SIDES = ["top", "bottom", "left", "right"] as const;

export type TooltipSide = (typeof TOOLTIP_SIDES)[number];

/** Between the trigger and its tooltip, as shadcn's Tooltip has it. */
export const TOOLTIP_OFFSET = 4;

/** Kept clear of the edges of the area the tooltip is drawn in. */
const EDGE_MARGIN = 4;

/**
 * Kept around the tooltip in the view it is drawn in, for its arrow, which
 * reaches past its box, since the view clips whatever falls outside it.
 */
export const TOOLTIP_VIEW_PADDING = 8;

/** Centred on `start` to `start + length`, and `EDGE_MARGIN` inside `room`. */
const centredWithin = (
  start: number,
  length: number,
  room: number,
  own: number
) =>
  clamp(
    start + (length - own) / 2,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, room - own - EDGE_MARGIN)
  );

/**
 * Where a tooltip of `size` sits beside `anchor` on `side`, centred on it,
 * and shifted along that side to stay inside `area` (both in the same
 * coordinates, the area's origin at 0, 0).
 */
export const tooltipRectangle = (
  anchor: Rectangle,
  size: Size,
  side: TooltipSide,
  area: Size
): Rectangle => {
  const centredX = centredWithin(
    anchor.x,
    anchor.width,
    area.width,
    size.width
  );
  const centredY = centredWithin(
    anchor.y,
    anchor.height,
    area.height,
    size.height
  );
  const position = {
    top: { x: centredX, y: anchor.y - TOOLTIP_OFFSET - size.height },
    bottom: { x: centredX, y: anchor.y + anchor.height + TOOLTIP_OFFSET },
    left: { x: anchor.x - TOOLTIP_OFFSET - size.width, y: centredY },
    right: { x: anchor.x + anchor.width + TOOLTIP_OFFSET, y: centredY },
  }[side];

  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: Math.ceil(size.width),
    height: Math.ceil(size.height),
  };
};

/**
 * The view a tooltip at `rectangle` on `side` of its trigger is drawn in,
 * with room for its arrow, kept inside `area`, the window's content. Toward
 * the trigger it reaches no further than the gap between them, since a clear
 * view takes every click in its bounds and would take the trigger's.
 */
export const tooltipViewBounds = (
  rectangle: Rectangle,
  side: TooltipSide,
  area: Size
): Rectangle => {
  const pad = (toward: TooltipSide) =>
    toward === side ? TOOLTIP_OFFSET : TOOLTIP_VIEW_PADDING;
  const x = Math.max(0, rectangle.x - pad("right"));
  const y = Math.max(0, rectangle.y - pad("bottom"));
  const right = rectangle.x + rectangle.width + pad("left");
  const bottom = rectangle.y + rectangle.height + pad("top");

  return {
    x,
    y,
    width: Math.max(0, Math.min(right, area.width) - x),
    height: Math.max(0, Math.min(bottom, area.height) - y),
  };
};
