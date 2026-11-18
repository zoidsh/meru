import { isEqual } from "es-toolkit";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

import { tabDrop } from "#core/tab-drop.ts";
import type { Box, Drop } from "#core/tab-drop.ts";

/** How far the pointer moves, across and down together, before a press drags. */
const THRESHOLD = 6;

/** How near the area's top or bottom edge the pointer scrolls it, and by how much a frame. */
const SCROLL_EDGE = 24;
const SCROLL_STEP = 8;

interface Drag {
  tabId: string;
  element: HTMLElement;
  point: { x: number; y: number };
  live: boolean;
  /** Escape or the window losing focus ended it before the pointer came up. */
  cancelled: boolean;
  drop: Drop | undefined;
  frame: number | undefined;
  stop: () => void;
}

const inside = (box: Box, { x, y }: { x: number; y: number }) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/**
 * Dragging a tab to another place in its area of the sidebar, the pinned
 * tiles or the list, which the area's element marks with `data-tab-area`.
 * A press drags once the pointer has moved a few pixels, so a click still
 * selects; the pointer is captured, so the drag keeps hearing it over the
 * page's view beside the sidebar and beyond the window. Releasing outside
 * the sidebar, Escape, the window losing focus and anything that takes the
 * pointer away end it with no move.
 */
export const useTabDrag = ({
  sidebar,
  blocked,
  tabIds,
  onMove,
}: {
  sidebar: RefObject<HTMLElement | null>;
  /** While an overlay is open, which a drag cannot start under. */
  blocked: boolean;
  /** The profile's tabs, so a drag whose tab goes ends. */
  tabIds: readonly string[];
  onMove: (tabId: string, before: string | undefined) => void;
}) => {
  const [line, setLine] = useState<Box>();
  const drag = useRef<Drag>(undefined);
  const swallowClick = useRef(false);

  const areaOf = (current: Drag) => {
    const area = current.element.closest<HTMLElement>("[data-tab-area]");
    const scroller = area?.closest<HTMLElement>('[data-slot="scroll-area"]');
    const viewport = area?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );

    return area && scroller && viewport
      ? { area, scroller, viewport }
      : undefined;
  };

  /** Where the drag would land with the pointer where it is. */
  const aim = (current: Drag) => {
    const parts = areaOf(current);
    const bounds = sidebar.current?.getBoundingClientRect();

    if (!parts || !bounds) {
      return;
    }

    const own = parts.scroller.getBoundingClientRect();
    // The empty sidebar below the list counts as the list's end.
    const region = {
      left: bounds.left,
      top: own.top,
      right: bounds.right,
      bottom:
        parts.area.dataset.tabArea === "listed" ? bounds.bottom : own.bottom,
    };

    if (!inside(region, current.point)) {
      return;
    }

    return tabDrop(
      [
        ...parts.area.querySelectorAll<HTMLElement>(":scope > [data-tab-id]"),
      ].map((tile) => ({
        id: tile.dataset.tabId ?? "",
        box: tile.getBoundingClientRect(),
      })),
      current.tabId,
      current.point
    );
  };

  /** Sets the line, redrawing the sidebar only when it moves. */
  const draw = (next: Box | undefined) => {
    setLine((previous) => (isEqual(previous, next) ? previous : next));
  };

  const show = (current: Drag) => {
    current.drop = current.cancelled ? undefined : aim(current);
    draw(current.drop?.line);
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
      onMove(current.tabId, current.drop.before);
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
      if (next.pointerId !== pointerId || drag.current !== current) {
        return;
      }

      // A release that never reached the shell.
      if (next.buttons === 0) {
        finish(false);

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
          // Gone already, which `lostpointercapture` does not then say.
        }

        scroll(current);
      }

      show(current);
    };

    const up = (next: PointerEvent) => {
      if (next.pointerId === pointerId) {
        // Where it lands is where the pointer is let go.
        if (current.live) {
          current.point = { x: next.clientX, y: next.clientY };
          show(current);
        }

        finish(true);
      }
    };

    const lost = (next: PointerEvent) => {
      if (next.pointerId === pointerId) {
        finish(false);
      }
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
      element,
      point: start,
      live: false,
      cancelled: false,
      drop: undefined,
      frame: undefined,
      stop: () => {
        if (current.frame !== undefined) {
          cancelAnimationFrame(current.frame);
        }

        removeListeners();
      },
    };

    const removeListeners = () => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", up);
      globalThis.removeEventListener("pointercancel", lost);
      element.removeEventListener("lostpointercapture", lost);
      globalThis.removeEventListener("keydown", key, true);
      globalThis.removeEventListener("blur", cancel);
    };

    drag.current = current;

    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up);
    globalThis.addEventListener("pointercancel", lost);
    element.addEventListener("lostpointercapture", lost);
    globalThis.addEventListener("keydown", key, true);
    globalThis.addEventListener("blur", cancel);
  };

  return {
    line,
    onPointerDown,
    /** Whether a click is the end of a drag, which selects nothing. */
    isDragClick: () => swallowClick.current,
  };
};
