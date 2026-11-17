/**
 * Scrolls just far enough to show the tab whole and `margin` clear of each
 * edge, along either axis. Toward either end the scroll stops where it can,
 * and there that side is no longer clipped.
 */
const scrollIntoScroller = (
  tab: HTMLElement,
  scroller: HTMLElement,
  margin: number
) => {
  const outer = scroller.getBoundingClientRect();
  const inner = tab.getBoundingClientRect();

  if (inner.left < outer.left + margin) {
    scroller.scrollLeft -= outer.left + margin - inner.left;
  } else if (inner.right > outer.right - margin) {
    scroller.scrollLeft += inner.right - (outer.right - margin);
  }

  if (inner.top < outer.top + margin) {
    scroller.scrollTop -= outer.top + margin - inner.top;
  } else if (inner.bottom > outer.bottom - margin) {
    scroller.scrollTop += inner.bottom - (outer.bottom - margin);
  }
};

/**
 * The selected tab's ref: keeps it in view, `margin` clear of the edges of
 * the element it scrolls in, when it becomes selected and whenever that
 * element changes size. Made once per margin, outside a render, since a new
 * ref each render would run again.
 */
export const keepInViewBy = (margin: number) => (tab: HTMLElement | null) => {
  const scroller = tab?.closest<HTMLElement>(
    "[data-tab-scroller], [data-slot=scroll-area-viewport]"
  );

  if (!tab || !scroller) {
    return;
  }

  const observer = new ResizeObserver(() => {
    scrollIntoScroller(tab, scroller, margin);
  });

  // Observing reports the current size at once, which scrolls it into view.
  observer.observe(scroller);

  return () => {
    observer.disconnect();
  };
};

export const keepInView = keepInViewBy(0);
