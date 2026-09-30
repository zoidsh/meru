import { describe, expect, test } from "bun:test";
import { resolveScrollEdge, type ScrollEdgeCandidate } from "./scroll-edge";

function candidate(overrides: Partial<ScrollEdgeCandidate> = {}): ScrollEdgeCandidate {
  return {
    scrollLeft: 0,
    scrollWidth: 800,
    clientWidth: 800,
    overflowX: "visible",
    overscrollBehaviorX: "auto",
    ...overrides,
  };
}

describe("resolveScrollEdge", () => {
  test("a page with nothing to scroll sideways claims nothing", () => {
    expect(resolveScrollEdge([candidate(), candidate({ isViewport: true })])).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
    });
  });

  test("an empty chain claims nothing", () => {
    expect(resolveScrollEdge([])).toEqual({ canScrollLeft: false, canScrollRight: false });
  });

  test("a scroller at its left edge claims only the forward direction", () => {
    expect(
      resolveScrollEdge([candidate({ overflowX: "auto", scrollWidth: 1600, scrollLeft: 0 })]),
    ).toEqual({ canScrollLeft: false, canScrollRight: true });
  });

  test("a scroller at its right edge claims only the back direction", () => {
    expect(
      resolveScrollEdge([candidate({ overflowX: "scroll", scrollWidth: 1600, scrollLeft: 800 })]),
    ).toEqual({ canScrollLeft: true, canScrollRight: false });
  });

  test("a scroller in the middle claims both directions", () => {
    expect(
      resolveScrollEdge([candidate({ overflowX: "auto", scrollWidth: 1600, scrollLeft: 400 })]),
    ).toEqual({ canScrollLeft: true, canScrollRight: true });
  });

  test("overflowing content that does not scroll claims nothing", () => {
    expect(resolveScrollEdge([candidate({ scrollWidth: 1600 })])).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
    });
  });

  test("the viewport scrolls whatever its computed overflow says", () => {
    expect(resolveScrollEdge([candidate({ isViewport: true, scrollWidth: 1600 })])).toEqual({
      canScrollLeft: false,
      canScrollRight: true,
    });
  });

  test("a truncated row of text claims nothing", () => {
    expect(
      resolveScrollEdge([candidate({ overflowX: "hidden", scrollWidth: 1600, scrollLeft: 0 })]),
    ).toEqual({ canScrollLeft: false, canScrollRight: false });
  });

  test("a clipped element claims nothing", () => {
    expect(
      resolveScrollEdge([candidate({ overflowX: "clip", scrollWidth: 1600, scrollLeft: 0 })]),
    ).toEqual({ canScrollLeft: false, canScrollRight: false });
  });

  test("a viewport with overflow-x of hidden claims nothing", () => {
    expect(
      resolveScrollEdge([candidate({ isViewport: true, overflowX: "hidden", scrollWidth: 1600 })]),
    ).toEqual({ canScrollLeft: false, canScrollRight: false });
  });

  test("a viewport with overflow-x of clip claims nothing", () => {
    expect(
      resolveScrollEdge([candidate({ isViewport: true, overflowX: "clip", scrollWidth: 1600 })]),
    ).toEqual({ canScrollLeft: false, canScrollRight: false });
  });

  test("a scroller at its edge hands the direction to the one outside it", () => {
    expect(
      resolveScrollEdge([
        candidate({ overflowX: "auto", scrollWidth: 1600, scrollLeft: 800 }),
        candidate({ overflowX: "auto", scrollWidth: 1600, scrollLeft: 0 }),
      ]),
    ).toEqual({ canScrollLeft: true, canScrollRight: true });
  });

  test("overscroll-behavior-x of contain claims both directions", () => {
    expect(
      resolveScrollEdge([
        candidate({ overflowX: "auto", overscrollBehaviorX: "contain" }),
        candidate({ overflowX: "auto", scrollWidth: 1600, scrollLeft: 800 }),
      ]),
    ).toEqual({ canScrollLeft: true, canScrollRight: true });
  });

  test("overscroll-behavior-x of none claims both directions", () => {
    expect(
      resolveScrollEdge([candidate({ isViewport: true, overscrollBehaviorX: "none" })]),
    ).toEqual({ canScrollLeft: true, canScrollRight: true });
  });

  test("overscroll-behavior-x is ignored on an element that is not a scroll container", () => {
    expect(resolveScrollEdge([candidate({ overscrollBehaviorX: "none" })])).toEqual({
      canScrollLeft: false,
      canScrollRight: false,
    });
  });

  test("sub-pixel scroll offsets count as the edge", () => {
    expect(
      resolveScrollEdge([
        candidate({ overflowX: "auto", scrollWidth: 1600.5, clientWidth: 800, scrollLeft: 0.5 }),
      ]),
    ).toEqual({ canScrollLeft: false, canScrollRight: true });
  });
});
