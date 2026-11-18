import { isEqual } from "es-toolkit";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

import { sidebarDrop } from "#core/tab-drop.ts";
import type { Box, DropTile, SidebarDrop } from "#core/tab-drop.ts";

import { followPointer } from "./follow-pointer.ts";

/** How far the pointer moves, across and down together, before a press drags. */
const THRESHOLD = 6;

/** How near the area's top or bottom edge the pointer scrolls it, and by how much a frame. */
const SCROLL_EDGE = 24;
const SCROLL_STEP = 8;

interface Drag {
  tabId: string;
  pinned: boolean;
  point: { x: number; y: number };
  live: boolean;
  /** Escape or the window losing focus ended it before the pointer came up. */
  cancelled: boolean;
  drop: SidebarDrop | undefined;
  frame: number | undefined;
  stop: () => void;
}

const inside = (box: Box, { x, y }: { x: number; y: number }) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

const boxOf = (element: Element): Box => {
  const { left, top, right, bottom } = element.getBoundingClientRect();

  return { left, top, right, bottom };
};

const tilesOf = (parent: Element): DropTile[] =>
  [...parent.querySelectorAll<HTMLElement>(":scope > [data-drop-id]")].map(
    (tile) => ({ id: tile.dataset.dropId ?? "", box: boxOf(tile) })
  );

/** What shows where a drag would land: a line between places, or a ring on a tab. */
export interface DragMark {
  kind: "line" | "ring";
  box: Box;
}

/**
 * Dragging a tab in the sidebar: to another place in its area, the pinned
 * tiles or the list, which the area's element marks with `data-tab-area`;
 * onto another tab, which splits the two; within the split's box, marked
 * `data-split-box`, among its tabs; or out of it. A press drags once the
 * pointer has moved a few pixels, so a click still selects; the pointer is
 * captured, so the drag keeps hearing it over the page's view beside the
 * sidebar and beyond the window. Releasing where nothing would land,
 * Escape, the window losing focus and anything that takes the pointer away
 * end it with nothing changed.
 */
export const useTabDrag = ({
  sidebar,
  blocked,
  tabIds,
  split,
  onDrop,
}: {
  sidebar: RefObject<HTMLElement | null>;
  /** While an overlay is open, which a drag cannot start under. */
  blocked: boolean;
  /** The profile's tabs, so a drag whose tab goes ends. */
  tabIds: readonly string[];
  /** Whether the profile has a split, which a tab outside it cannot join. */
  split: boolean;
  onDrop: (tabId: string, drop: SidebarDrop) => void;
}) => {
  const [mark, setMark] = useState<DragMark>();
  const drag = useRef<Drag>(undefined);
  const swallowClick = useRef(false);

  /** The area the tab lands in: its own, the pinned tiles or the list. */
  const areaOf = (current: Drag) => {
    const area = sidebar.current?.querySelector<HTMLElement>(
      `[data-tab-area="${current.pinned ? "pinned" : "listed"}"]`
    );
    const scroller = area?.closest<HTMLElement>('[data-slot="scroll-area"]');
    const viewport = area?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );

    return area && scroller && viewport
      ? { area, scroller, viewport }
      : undefined;
  };

  /**
   * The places of the area the tab lands in while the pointer is over it;
   * the empty sidebar below the list counts as the list's end, and for a
   * pinned tab leaving the box, as the pinned area's.
   */
  const placesAt = (current: Drag, bounds: Box, boxed: boolean) => {
    const parts = areaOf(current);

    if (!parts) {
      return;
    }

    const own = boxOf(parts.scroller);
    const region = {
      left: bounds.left,
      top: own.top,
      right: bounds.right,
      bottom: current.pinned && !boxed ? own.bottom : bounds.bottom,
    };

    return inside(region, current.point) ? tilesOf(parts.area) : undefined;
  };

  /**
   * With no list drawn, as when every tab not pinned is in a box among the
   * pinned tiles, the sidebar below the pinned area is the list's end, a
   * tab not pinned landing there by a line above Open app.
   */
  const listEnd = (current: Drag, bounds: Box): SidebarDrop | undefined => {
    const root = sidebar.current;
    const end = root?.querySelector("[data-list-end]");
    const pinned = root
      ?.querySelector('[data-tab-area="pinned"]')
      ?.closest('[data-slot="scroll-area"]');

    if (current.pinned || areaOf(current) || !end || !pinned) {
      return;
    }

    const top = boxOf(pinned).bottom;
    const { left, right, top: endTop } = boxOf(end);
    const y = (top + endTop) / 2 - 1;

    return inside({ ...bounds, top }, current.point)
      ? {
          kind: "move",
          before: undefined,
          line: { left: left - 3, top: y, right: right + 3, bottom: y + 2 },
        }
      : undefined;
  };

  /** Where the drag would land with the pointer where it is. */
  const aim = (current: Drag) => {
    const root = sidebar.current;
    const box = root?.querySelector("[data-split-box]") ?? undefined;

    if (!root) {
      return;
    }

    const bounds = boxOf(root);
    const tabs = [...root.querySelectorAll<HTMLElement>("[data-tab-id]")].map(
      (tab) => ({
        id: tab.dataset.tabId ?? "",
        box: boxOf(tab),
        boxed: box?.contains(tab) ?? false,
      })
    );

    const boxed = tabs.some((tab) => tab.id === current.tabId && tab.boxed);

    return (
      sidebarDrop({
        dragged: { id: current.tabId, pinned: current.pinned, boxed },
        point: current.point,
        tabs,
        split,
        box: box && { box: boxOf(box), rows: tilesOf(box) },
        area: placesAt(current, bounds, boxed),
      }) ?? listEnd(current, bounds)
    );
  };

  /** Sets the mark, redrawing the sidebar only when it moves. */
  const draw = (next: DragMark | undefined) => {
    setMark((previous) => (isEqual(previous, next) ? previous : next));
  };

  const show = (current: Drag) => {
    current.drop = current.cancelled ? undefined : aim(current);

    const { drop } = current;

    draw(
      drop &&
        (drop.kind === "onto"
          ? { kind: "ring", box: drop.ring }
          : { kind: "line", box: drop.line })
    );
  };

  const scroll = (current: Drag) => {
    current.frame = requestAnimationFrame(() => {
      const viewport = areaOf(current)?.viewport;

      if (viewport && !current.cancelled) {
        const { top, bottom } = viewport.getBoundingClientRect();
        const { y } = current.point;
        let by = 0;

        if (y < top + SCROLL_EDGE) {
          by = -SCROLL_STEP;
        } else if (y > bottom - SCROLL_EDGE) {
          by = SCROLL_STEP;
        }

        if (by !== 0 && y >= top - SCROLL_EDGE && y <= bottom + SCROLL_EDGE) {
          viewport.scrollTop += by;
          show(current);
        }
      }

      if (!current.cancelled) {
        scroll(current);
      }
    });
  };

  const cancel = () => {
    const { current } = drag;

    if (current) {
      current.cancelled = true;
      current.drop = undefined;

      if (current.frame !== undefined) {
        cancelAnimationFrame(current.frame);
        current.frame = undefined;
      }

      draw(undefined);
    }
  };

  const finish = (dropped: boolean) => {
    const { current } = drag;

    if (!current) {
      return;
    }

    drag.current = undefined;
    current.stop();
    draw(undefined);

    if (current.live) {
      // The click that follows the release is the drag's, not a selection.
      swallowClick.current = true;
      setTimeout(() => {
        swallowClick.current = false;
      }, 0);
    }

    if (dropped && current.live && current.drop) {
      onDrop(current.tabId, current.drop);
    }
  };

  // An overlay opening, or the tab going, ends the drag.
  useEffect(() => {
    const { current } = drag;

    if (current && (blocked || !tabIds.includes(current.tabId))) {
      cancel();
    }
  });

  useEffect(
    () => () => {
      drag.current?.stop();
    },
    []
  );

  const onPointerDown = (
    tabId: string,
    pinned: boolean,
    event: ReactPointerEvent<HTMLElement>
  ) => {
    // A press left over from a drag whose release never came.
    finish(false);

    // A Control-click is the context menu's on macOS.
    if (event.button !== 0 || event.ctrlKey || blocked) {
      return;
    }

    const element = event.currentTarget;
    const { pointerId } = event;
    const start = { x: event.clientX, y: event.clientY };

    const move = (next: PointerEvent) => {
      if (drag.current !== current) {
        return;
      }

      current.point = { x: next.clientX, y: next.clientY };

      if (!current.live) {
        const moved =
          Math.abs(current.point.x - start.x) +
          Math.abs(current.point.y - start.y);

        if (moved < THRESHOLD) {
          return;
        }

        current.live = true;

        try {
          element.setPointerCapture(pointerId);
        } catch {
          // The pointer is gone already, which its release or loss then ends.
        }

        scroll(current);
      }

      show(current);
    };

    const up = (next: PointerEvent) => {
      // Where it lands is where the pointer is let go.
      if (current.live) {
        current.point = { x: next.clientX, y: next.clientY };
        show(current);
      }

      finish(true);
    };

    const key = (next: KeyboardEvent) => {
      if (next.key === "Escape" && current.live) {
        next.preventDefault();
        next.stopPropagation();
        cancel();
      }
    };

    const current: Drag = {
      tabId,
      pinned,
      point: start,
      live: false,
      cancelled: false,
      drop: undefined,
      frame: undefined,
      stop: () => {
        if (current.frame !== undefined) {
          cancelAnimationFrame(current.frame);
        }

        stopFollowing();
        globalThis.removeEventListener("keydown", key, true);
        globalThis.removeEventListener("blur", cancel);

        if (element.hasPointerCapture(pointerId)) {
          element.releasePointerCapture(pointerId);
        }
      },
    };

    drag.current = current;

    const stopFollowing = followPointer(globalThis, pointerId, {
      move,
      up,
      lost: () => {
        finish(false);
      },
    });
    globalThis.addEventListener("keydown", key, true);
    globalThis.addEventListener("blur", cancel);
  };

  return {
    mark,
    onPointerDown,
    /** Whether a click is the end of a drag, which selects nothing. */
    isDragClick: () => swallowClick.current,
  };
};
