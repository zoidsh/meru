import { minBy } from "es-toolkit";

import { paneRectangles } from "./pane-tree.ts";
import type { PaneDirection, PaneRectangle } from "./pane-tree.ts";
import {
  shownPanes,
  splitAlongEdge,
  splitBeside,
  splitPanes,
  splitRoomy,
} from "./split.ts";
import { knownTabs } from "./state.ts";
import type { Profile } from "./state.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/** How near the page area's outer edge a tab dragged into it goes along that edge. */
export const VIEW_EDGE = 24;

export const VIEW_SIDES = ["left", "right", "top", "bottom"] as const;

export type ViewSide = (typeof VIEW_SIDES)[number];

/** What dropping a tab dragged over the page area does, and what shows it. */
export interface ViewDrop {
  /** Splits the pane under the pointer, or goes along the whole view's edge. */
  kind: "pane" | "edge";
  side: ViewSide;
  /** What lights up, in the page area: the pane's half, or the edge's band. */
  zone: Rectangle;
  /** The profile after the drop. */
  next: Profile;
  /** Whether every pane is at least the minimum after it; if not, it does nothing. */
  fits: boolean;
}

const directionOf = (side: ViewSide): PaneDirection =>
  side === "left" || side === "right" ? "row" : "column";

const isFirst = (side: ViewSide) => side === "left" || side === "top";

/** The side whose distance is least, the earlier in `VIEW_SIDES` on a tie. */
const nearest = (distances: Record<ViewSide, number>): ViewSide =>
  minBy([...VIEW_SIDES], (side) => distances[side]) ?? "left";

const contains = (
  { x, y, width, height }: Rectangle,
  point: { x: number; y: number }
) =>
  point.x >= x && point.x < x + width && point.y >= y && point.y < y + height;

/** The half of `bounds` on `side`. */
const half = (bounds: Rectangle, side: ViewSide): Rectangle => {
  if (directionOf(side) === "row") {
    const width = Math.round(bounds.width / 2);

    return {
      ...bounds,
      x: side === "left" ? bounds.x : bounds.x + bounds.width - width,
      width,
    };
  }

  const height = Math.round(bounds.height / 2);

  return {
    ...bounds,
    y: side === "top" ? bounds.y : bounds.y + bounds.height - height,
    height,
  };
};

/** The panes on screen in `area`, a tab shown alone filling it. */
const onScreen = (profile: Profile, area: Rectangle): PaneRectangle[] => {
  const shown = shownPanes(profile);

  if (shown) {
    return paneRectangles(shown, area);
  }

  return knownTabs(profile).some((tab) => tab.id === profile.selectedTabId)
    ? [{ tabId: profile.selectedTabId, bounds: area }]
    : [];
};

const alongEdge = (
  profile: Profile,
  area: Rectangle,
  tabId: string,
  side: ViewSide
): ViewDrop | undefined => {
  const direction = directionOf(side);
  const next = splitAlongEdge(
    profile,
    tabId,
    direction,
    isFirst(side),
    direction === "row" ? area.width : area.height
  );
  const panes = next && splitPanes(next);
  const zone =
    panes &&
    paneRectangles(panes, area).find((pane) => pane.tabId === tabId)?.bounds;

  return next && zone
    ? { kind: "edge", side, zone, next, fits: splitRoomy(next, area) }
    : undefined;
};

/**
 * What dropping `tabId`, dragged with the pointer at `point` over the
 * selected profile's page area of `size`, does; `point` is in the area,
 * whose top left is 0, 0, and may lie past its edges in the window's inset.
 * Within `VIEW_EDGE` of the area's outer edge, the nearest edge, the earlier
 * of left, right, top and bottom where two are as near, takes the tab along
 * it beside everything else on screen. Elsewhere the nearest half of the
 * pane under the pointer splits that pane that way, a tab shown alone being
 * a pane filling the area. Nothing over the tab's own page, in a gap, or
 * where the split would be refused, as beside a tab outside the profile's
 * split while it has one.
 */
export const viewDrop = (
  profile: Profile,
  size: Size,
  point: { x: number; y: number },
  tabId: string
): ViewDrop | undefined => {
  // Main passes the area's bounds in the window, whose origin is not the point's.
  const area = { x: 0, y: 0, width: size.width, height: size.height };
  const distances = {
    left: point.x,
    right: size.width - point.x,
    top: point.y,
    bottom: size.height - point.y,
  };
  const edge = nearest(distances);

  if (distances[edge] < VIEW_EDGE) {
    const along = alongEdge(profile, area, tabId, edge);

    if (along) {
      return along;
    }
  }

  const pane = onScreen(profile, area).find(({ bounds }) =>
    contains(bounds, point)
  );

  if (!pane || pane.tabId === tabId) {
    return undefined;
  }

  const { bounds } = pane;
  const across = (point.x - bounds.x) / bounds.width;
  const down = (point.y - bounds.y) / bounds.height;
  const side = nearest({
    left: across,
    right: 1 - across,
    top: down,
    bottom: 1 - down,
  });
  const next = splitBeside(
    profile,
    tabId,
    pane.tabId,
    directionOf(side),
    isFirst(side)
  );

  return next
    ? {
        kind: "pane",
        side,
        zone: half(bounds, side),
        next,
        fits: splitRoomy(next, size),
      }
    : undefined;
};
