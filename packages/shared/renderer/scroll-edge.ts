/// <reference lib="dom" />

import { ms } from "../ms";
import { type PageScrollEdge, resolveScrollEdge, type ScrollEdgeCandidate } from "../scroll-edge";

const SCROLL_EDGE_THROTTLE = ms("100ms");

function readCandidate(element: Element, isViewport: boolean): ScrollEdgeCandidate {
  const style = window.getComputedStyle(element);

  return {
    scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    overflowX: style.overflowX,
    overscrollBehaviorX: style.overscrollBehaviorX,
    direction: style.direction,
    isViewport,
  };
}

function readChain(element: Element | null) {
  const chain: ScrollEdgeCandidate[] = [];

  for (let current = element; current; current = current.parentElement) {
    chain.push(readCandidate(current, current === document.scrollingElement));
  }

  return chain;
}

/**
 * Keeps the main process told what the page under the pointer can still scroll,
 * because a swipe has to be answered while its scroll event waits to be
 * delivered and there is no time to ask the page then.
 *
 * `wheel` matters as much as `pointermove`: scrolling a carousel to its end
 * moves no pointer, and the state at that moment is what the next gesture is
 * judged on.
 */
export function observePageScrollEdge(send: (pageScrollEdge: PageScrollEdge) => void) {
  let pointer: { x: number; y: number } | undefined;
  let sent: PageScrollEdge | undefined;
  let lastUpdatedAt = 0;

  const update = () => {
    if (!pointer) {
      return;
    }

    const pageScrollEdge = resolveScrollEdge(
      readChain(document.elementFromPoint(pointer.x, pointer.y)),
    );

    if (
      sent &&
      sent.canScrollLeft === pageScrollEdge.canScrollLeft &&
      sent.canScrollRight === pageScrollEdge.canScrollRight
    ) {
      return;
    }

    sent = pageScrollEdge;

    send(pageScrollEdge);
  };

  const throttledUpdate = () => {
    const now = Date.now();

    if (now - lastUpdatedAt < SCROLL_EDGE_THROTTLE) {
      return;
    }

    lastUpdatedAt = now;

    update();
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };

      throttledUpdate();
    },
    { passive: true },
  );

  window.addEventListener("wheel", throttledUpdate, { capture: true, passive: true });

  window.addEventListener("scroll", throttledUpdate, { capture: true, passive: true });
}
