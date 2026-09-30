/** One element of the chain out from the pointer, as the scroll edge reads it. */
export type ScrollEdgeCandidate = {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
  overscrollBehaviorX: string;
  /** The viewport scrolls whatever its computed `overflow-x` says. */
  isViewport?: boolean;
};

export type PageScrollEdge = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

/** Sub-pixel scroll offsets put the end of a scroller off an exact integer. */
const SCROLL_EDGE_EPSILON = 1;

const SCROLL_CONTAINER_OVERFLOWS = new Set(["auto", "scroll", "overlay", "hidden"]);

const OVERSCROLL_CONTAINING_BEHAVIORS = new Set(["contain", "none"]);

function isScrollContainer(candidate: ScrollEdgeCandidate) {
  return candidate.isViewport === true || SCROLL_CONTAINER_OVERFLOWS.has(candidate.overflowX);
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

    const remaining = candidate.scrollWidth - candidate.clientWidth - candidate.scrollLeft;

    canScrollLeft = canScrollLeft || candidate.scrollLeft > SCROLL_EDGE_EPSILON;
    canScrollRight = canScrollRight || remaining > SCROLL_EDGE_EPSILON;

    if (canScrollLeft && canScrollRight) {
      break;
    }
  }

  return { canScrollLeft, canScrollRight };
}
