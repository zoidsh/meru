/** Scrolls just far enough to show the tab whole, along either axis. */
const scrollIntoScroller = (tab: HTMLElement, scroller: HTMLElement) => {
  const outer = scroller.getBoundingClientRect();
  const inner = tab.getBoundingClientRect();

  if (inner.left < outer.left) {
    scroller.scrollLeft -= outer.left - inner.left;
  } else if (inner.right > outer.right) {
    scroller.scrollLeft += inner.right - outer.right;
  }

  if (inner.top < outer.top) {
    scroller.scrollTop -= outer.top - inner.top;
  } else if (inner.bottom > outer.bottom) {
    scroller.scrollTop += inner.bottom - outer.bottom;
  }
};

/**
 * The selected tab's ref: keeps it in view when it becomes selected and
 * whenever the element it scrolls in changes size.
 */
export const keepInView = (tab: HTMLElement | null) => {
  const scroller = tab?.closest<HTMLElement>(
    "[data-tab-scroller], [data-slot=scroll-area-viewport]"
  );

  if (!tab || !scroller) {
    return;
  }

  const observer = new ResizeObserver(() => {
    scrollIntoScroller(tab, scroller);
  });

  // Observing reports the current size at once, which scrolls it into view.
  observer.observe(scroller);

  return () => {
    observer.disconnect();
  };
};
