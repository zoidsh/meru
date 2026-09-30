import type { SwipeDirection } from "./types";

export type SwipeNavigationAction = "back" | "forward";

export const SWIPE_DIRECTION_ACTIONS = {
  left: "back",
  right: "forward",
} as const satisfies Record<SwipeDirection, SwipeNavigationAction>;

/**
 * Whether the page under the pointer has anywhere left to scroll sideways,
 * which is the page's claim on the gesture.
 */
export type PageScrollEdge = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

export type SwipeBeginDecision =
  | { action: SwipeNavigationAction }
  | { refusedBecause: "noHistoryEntry" | "pageCanStillScroll" };

export function decideSwipeBegin({
  direction,
  canGoBack,
  canGoForward,
  pageScrollEdge,
}: {
  direction: SwipeDirection;
  canGoBack: boolean;
  canGoForward: boolean;
  pageScrollEdge: PageScrollEdge;
}): SwipeBeginDecision {
  const action = SWIPE_DIRECTION_ACTIONS[direction];

  if (action === "back" ? !canGoBack : !canGoForward) {
    return { refusedBecause: "noHistoryEntry" };
  }

  // The page comes first, as it does in Chrome: a horizontally scrolled table
  // or carousel scrolls to its end, and only a gesture that starts there
  // navigates.
  if (action === "back" ? pageScrollEdge.canScrollLeft : pageScrollEdge.canScrollRight) {
    return { refusedBecause: "pageCanStillScroll" };
  }

  return { action };
}

export function isPointInBounds(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
) {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}
