import { isEqual } from "es-toolkit";

import { transitionOverlay } from "#core/overlay.ts";
import type { Overlay, OverlayEvent } from "#core/overlay.ts";
import type { State } from "#core/state.ts";
import type { Rectangle } from "#core/window-bounds.ts";
import type { OverlayView } from "#platform/overlay-view.ts";

import type { Focus, FocusTarget } from "./focus.ts";

export interface OverlaysDeps {
  focus: Pick<Focus, "focus" | "focused">;
  /** Main's state when the overlays start following it. */
  initial: State;
  /** Where the view sits while an overlay is open, as the window is now. */
  bounds: () => Rectangle;
  log: (message: string) => void;
}

/**
 * Which overlay is open over the content views, in the one view the shell's
 * overlay document shows in. Opening shows the view and focuses it before
 * the shell hears of it; closing hides it and gives focus back to whichever
 * web contents had it, or the selected tab's view when that one is gone.
 */
export const createOverlays = ({
  focus,
  initial,
  bounds,
  log,
}: OverlaysDeps) => {
  const listeners = new Set<() => void>();
  let view: OverlayView | undefined;
  let open: Overlay | undefined;
  let returnTo: FocusTarget | undefined;
  let state = initial;

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const show = (overlay: Overlay) => {
    if (!view) {
      log(`The ${overlay.kind} overlay has no view to open in yet`);

      return;
    }

    if (!open) {
      returnTo = focus.focused();
    }

    view.setBounds(bounds());
    view.show();
    open = overlay;
    focus.focus([{ kind: "overlay" }]);
    notify();
  };

  const hide = () => {
    const target = returnTo;

    open = undefined;
    returnTo = undefined;
    view?.hide();
    notify();
    focus.focus([
      ...(target && target.kind !== "overlay" ? [target] : []),
      { kind: "front" },
      { kind: "shell" },
    ]);
  };

  const dispatch = (event: OverlayEvent) => {
    const next = transitionOverlay(open, event);

    if (isEqual(next, open)) {
      return;
    }

    if (next) {
      show(next);
    } else {
      hide();
    }
  };

  return {
    /**
     * Takes the view the shell's overlay document shows in, in place of one
     * whose shell has reloaded.
     */
    adopt: (next: OverlayView) => {
      view = next;
      next.onGone(() => {
        if (view === next) {
          view = undefined;

          if (open) {
            hide();
          }
        }
      });
    },
    open: (overlay: Overlay) => {
      dispatch({ kind: "open", overlay });
    },
    close: () => {
      dispatch({ kind: "close" });
    },
    /** Told of each change of main's state, which may close what is open. */
    follow: (next: State) => {
      const previous = state;

      state = next;
      dispatch({ kind: "state-changed", previous, next });
    },
    /** Places the view again, as the window now has it. */
    relayout: () => {
      if (open && view) {
        view.setBounds(bounds());
      }
    },
    current: () => open,
    /** What focuses the overlay, while one is open. */
    focuser: () => (open && view ? view.focus : undefined),
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type Overlays = ReturnType<typeof createOverlays>;
