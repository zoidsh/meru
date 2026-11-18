import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

import type { ShellState } from "#contract/shell.ts";
import type { PaneGapEnd } from "#core/pane-tree.ts";

import { followPointer } from "./follow-pointer.ts";
import { shellCalls } from "./sync.ts";

type Handle = ShellState["tabs"]["handles"][number];

/** How far an arrow key moves a gap. */
const KEY_STEP = 24;

let gestures = 0;

/** Each drag or key press is a gesture of its own, which main starts from the split as stored. */
const nextGesture = () => {
  gestures += 1;

  return gestures;
};

interface Drag {
  gesture: number;
  start: number;
  by: number;
  frame: number | undefined;
  stop?: () => void;
}

/**
 * The gap between two panes, which resizes them: a drag moves it, sending
 * main at most one move a frame and the last on release; an arrow key
 * steps it, Home and End take it to each side's minimum, and Enter or a
 * double-click evens out its split. Main places the gap and the pages, so
 * it stops where a pane's minimum does.
 */
export const PaneHandle = ({ handle }: { handle: Handle }) => {
  const { t, i18n } = useLingui();
  const drag = useRef<Drag | undefined>(undefined);
  const across = handle.direction === "row";
  const { before, after } = handle;

  const send = (by: number, gesture: number, done: boolean) => {
    shellCalls().resizePanes({ before, after, by, gesture, done });
  };

  const end = (done: boolean) => {
    const { current } = drag;

    if (!current) {
      return;
    }

    drag.current = undefined;
    current.stop?.();

    // A drag cut short still stores where it got to, as its last move showed.
    send(current.by, current.gesture, done);
  };

  useEffect(
    () => () => {
      drag.current?.stop?.();
    },
    []
  );

  const at = (event: { clientX: number; clientY: number }) =>
    across ? event.clientX : event.clientY;

  const follow = (pointerId: number, element: HTMLElement, current: Drag) => {
    const stopFollowing = followPointer(globalThis, pointerId, {
      move: (event) => {
        if (drag.current !== current) {
          return;
        }

        current.by = Math.round(at(event) - current.start);

        if (current.frame === undefined) {
          current.frame = requestAnimationFrame(() => {
            current.frame = undefined;

            if (drag.current === current) {
              send(current.by, current.gesture, false);
            }
          });
        }
      },
      up: (event) => {
        // Where it is let go, which a move Chromium held for the next frame
        // may not have told.
        current.by = Math.round(at(event) - current.start);
        end(true);
      },
      lost: () => {
        end(true);
      },
    });

    current.stop = () => {
      stopFollowing();

      if (current.frame !== undefined) {
        cancelAnimationFrame(current.frame);
      }

      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    };
  };

  const step = (by: number) => {
    send(by, nextGesture(), true);
  };

  // Main measures these from the split as stored, which a step just sent
  // may not yet have reached this handle's numbers.
  const stepTo = (to: PaneGapEnd) => {
    shellCalls().resizePanes({
      before,
      after,
      by: 0,
      to,
      gesture: nextGesture(),
      done: true,
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const back = across ? "ArrowLeft" : "ArrowUp";
    const forward = across ? "ArrowRight" : "ArrowDown";

    switch (event.key) {
      case back: {
        step(-KEY_STEP);
        break;
      }
      case forward: {
        step(KEY_STEP);
        break;
      }
      case "Home": {
        stepTo("minimum");
        break;
      }
      case "End": {
        stepTo("maximum");
        break;
      }
      case "Enter": {
        shellCalls().evenOutPanes({ before, after });
        break;
      }
      default: {
        return;
      }
    }

    event.preventDefault();
  };

  const percent = i18n.number(
    handle.span > 0 ? handle.size / handle.span : 0.5,
    { style: "percent", maximumFractionDigits: 0 }
  );
  const valueText = across
    ? t({
        message: `Left pane ${percent}`,
        comment:
          "Said by screen readers of the gap between two panes side by side: how much of the two the left one takes; {percent} is a percentage, such as 60%",
      })
    : t({
        message: `Upper pane ${percent}`,
        comment:
          "Said by screen readers of the gap between two panes one above the other: how much of the two the upper one takes; {percent} is a percentage, such as 60%",
      });

  // A focusable separator is a widget, the window splitter of ARIA's
  // practices, which the lint's list of interactive roles leaves out.
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <hr
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-label={t({
        message: "Resize panes",
        comment:
          "Accessible name of the gap between two panes of a split view, which a drag or the arrow keys move to resize them",
      })}
      aria-orientation={across ? "vertical" : "horizontal"}
      aria-valuemin={handle.minimum}
      aria-valuemax={handle.maximum}
      aria-valuenow={handle.size}
      aria-valuetext={valueText}
      data-pane-handle={`${before}|${after}`}
      style={{
        left: handle.x,
        top: handle.y,
        width: handle.width,
        height: handle.height,
      }}
      // The ring is drawn inside the gap, since the pages' views cover
      // anything past it.
      className={cn(
        "absolute m-0 touch-none rounded-[4px] border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "after:pointer-events-none after:absolute after:rounded-[1px] after:bg-muted-foreground after:opacity-0 hover:after:opacity-60 focus-visible:after:bg-foreground focus-visible:after:opacity-100 active:after:opacity-60",
        across
          ? "cursor-col-resize after:top-1/2 after:left-[3px] after:h-8 after:w-0.5 after:-translate-y-1/2"
          : "cursor-row-resize after:top-[3px] after:left-1/2 after:h-0.5 after:w-8 after:-translate-x-1/2"
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }

        // A press left over from a drag whose release never came.
        end(true);
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);

        const current: Drag = {
          gesture: nextGesture(),
          start: at(event),
          by: 0,
          frame: undefined,
        };

        drag.current = current;
        follow(event.pointerId, event.currentTarget, current);
      }}
      onDoubleClick={() => {
        shellCalls().evenOutPanes({ before, after });
      }}
      onKeyDown={onKeyDown}
    />
  );
};
