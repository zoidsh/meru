import { describe, expect, test } from "bun:test";
import { decideSwipeBegin, isPointInBounds } from "./decide";

const AT_BOTH_EDGES = { canScrollLeft: false, canScrollRight: false };

describe("decideSwipeBegin", () => {
  test("a left swipe over a page at its left edge goes back", () => {
    expect(
      decideSwipeBegin({
        direction: "left",
        canGoBack: true,
        canGoForward: false,
        pageScrollEdge: AT_BOTH_EDGES,
      }),
    ).toEqual({ action: "back" });
  });

  test("a right swipe over a page at its right edge goes forward", () => {
    expect(
      decideSwipeBegin({
        direction: "right",
        canGoBack: false,
        canGoForward: true,
        pageScrollEdge: AT_BOTH_EDGES,
      }),
    ).toEqual({ action: "forward" });
  });

  test("a swipe with no history entry behind it is refused", () => {
    expect(
      decideSwipeBegin({
        direction: "left",
        canGoBack: false,
        canGoForward: true,
        pageScrollEdge: AT_BOTH_EDGES,
      }),
    ).toEqual({ refusedBecause: "noHistoryEntry" });
  });

  test("a swipe with no history entry ahead of it is refused", () => {
    expect(
      decideSwipeBegin({
        direction: "right",
        canGoBack: true,
        canGoForward: false,
        pageScrollEdge: AT_BOTH_EDGES,
      }),
    ).toEqual({ refusedBecause: "noHistoryEntry" });
  });

  test("the page keeps the gesture while it can still scroll that way", () => {
    expect(
      decideSwipeBegin({
        direction: "left",
        canGoBack: true,
        canGoForward: true,
        pageScrollEdge: { canScrollLeft: true, canScrollRight: false },
      }),
    ).toEqual({ refusedBecause: "pageCanStillScroll" });

    expect(
      decideSwipeBegin({
        direction: "right",
        canGoBack: true,
        canGoForward: true,
        pageScrollEdge: { canScrollLeft: false, canScrollRight: true },
      }),
    ).toEqual({ refusedBecause: "pageCanStillScroll" });
  });

  test("a page that can scroll the other way does not block the swipe", () => {
    expect(
      decideSwipeBegin({
        direction: "left",
        canGoBack: true,
        canGoForward: true,
        pageScrollEdge: { canScrollLeft: false, canScrollRight: true },
      }),
    ).toEqual({ action: "back" });
  });

  test("history is checked before the page, so a log line says which", () => {
    expect(
      decideSwipeBegin({
        direction: "left",
        canGoBack: false,
        canGoForward: false,
        pageScrollEdge: { canScrollLeft: true, canScrollRight: true },
      }),
    ).toEqual({ refusedBecause: "noHistoryEntry" });
  });
});

describe("isPointInBounds", () => {
  const bounds = { x: 48, y: 38, width: 800, height: 600 };

  test("a point inside the view is inside", () => {
    expect(isPointInBounds({ x: 400, y: 300 }, bounds)).toBe(true);
  });

  test("the top-left corner is inside and the bottom-right one is not", () => {
    expect(isPointInBounds({ x: 48, y: 38 }, bounds)).toBe(true);
    expect(isPointInBounds({ x: 848, y: 638 }, bounds)).toBe(false);
  });

  test("a point over the titlebar or the tabs strip is outside", () => {
    expect(isPointInBounds({ x: 400, y: 20 }, bounds)).toBe(false);
    expect(isPointInBounds({ x: 20, y: 300 }, bounds)).toBe(false);
  });
});
