export type ScrollEdgeCandidate = {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
  overscrollBehaviorX: string;
  /**
   * `rtl` puts `scrollLeft` at `0` on the right-hand end and takes it negative
   * from there, which is what CSSOM says and what Chromium does.
   */
  direction: string;
  isViewport?: boolean;
};

export type PageScrollEdge = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

/** Sub-pixel scroll offsets put the end of a scroller off an exact integer. */
const SCROLL_EDGE_EPSILON = 1;

const SCROLL_CONTAINER_OVERFLOWS = new Set(["auto", "scroll", "overlay"]);

/**
 * `hidden` scrolls only programmatically, and it is what truncates a row of text
 * beside `text-overflow: ellipsis`, as every row of Gmail's inbox does — so
 * counting it as a scroller refuses a forward swipe anywhere in the list.
 */
const NON_SCROLLING_OVERFLOWS = new Set(["hidden", "clip"]);

const OVERSCROLL_CONTAINING_BEHAVIORS = new Set(["contain", "none"]);

/** The viewport scrolls on anything but an overflow that cuts the page off. */
function isScrollContainer(candidate: ScrollEdgeCandidate) {
  if (candidate.isViewport === true) {
    return !NON_SCROLLING_OVERFLOWS.has(candidate.overflowX);
  }

  return SCROLL_CONTAINER_OVERFLOWS.has(candidate.overflowX);
}

/**
 * What the page can still do sideways, given the scroll containers from the
 * element under the pointer outwards. A scroller at its edge hands the scroll to
 * the one outside it, so every container in the chain has a say.
 *
 * `overscroll-behavior-x` of `contain` or `none` is how a page keeps a swipe to
 * itself, so a container carrying it claims the gesture in both directions
 * whether or not it has anywhere to scroll.
 */
export function resolveScrollEdge(chain: ScrollEdgeCandidate[]): PageScrollEdge {
  let canScrollLeft = false;
  let canScrollRight = false;

  for (const candidate of chain) {
    if (!isScrollContainer(candidate)) {
      continue;
    }

    if (OVERSCROLL_CONTAINING_BEHAVIORS.has(candidate.overscrollBehaviorX)) {
      return { canScrollLeft: true, canScrollRight: true };
    }

    const scrollableWidth = candidate.scrollWidth - candidate.clientWidth;

    if (candidate.direction === "rtl") {
      canScrollLeft =
        canScrollLeft || -candidate.scrollLeft < scrollableWidth - SCROLL_EDGE_EPSILON;
      canScrollRight = canScrollRight || candidate.scrollLeft < -SCROLL_EDGE_EPSILON;
    } else {
      canScrollLeft = canScrollLeft || candidate.scrollLeft > SCROLL_EDGE_EPSILON;
      canScrollRight =
        canScrollRight || scrollableWidth - candidate.scrollLeft > SCROLL_EDGE_EPSILON;
    }

    if (canScrollLeft && canScrollRight) {
      break;
    }
  }

  return { canScrollLeft, canScrollRight };
}
