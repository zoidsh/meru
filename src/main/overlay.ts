import { isEqual } from "es-toolkit";

import { isMenu, takesNoFocus, transitionOverlay } from "#core/overlay.ts";
import type { Overlay, OverlayEvent } from "#core/overlay.ts";
import type { State } from "#core/state.ts";
import type { Rectangle } from "#core/window-bounds.ts";
import type { OverlayView } from "#platform/overlay-view.ts";

import type { Focus } from "./focus.ts";

/** How long a toast shows. */
export const TOAST_DURATION = 4000;

export interface OverlaysDeps {
  focus: Pick<Focus, "focus">;
  /** Main's state when the overlays start following it. */
  initial: State;
  /** Where the view sits while `overlay` is open, as the window is now. */
  bounds: (overlay: Overlay) => Rectangle;
  log: (message: string) => void;
}

/**
 * Which overlay is open over the content views, in the one view the shell's
 * overlay document shows in. Opening shows the view and focuses it before
 * the shell hears of it; closing hides it and gives focus to the selected
 * tab's view, or the shell when there is none. Never back to the shell when
 * the shell had it: that is the button that opened the overlay, and focus
 * left in the titlebar would leave Gmail's keys dead. A menu is the
 * exception: it gives focus to the shell, which puts it back on the control
 * the menu was opened on, unless the window losing focus closed it or
 * another profile was selected, which give focus to the page. A toast takes
 * no focus and gives none back, and closes by itself after a few seconds.
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
  let state = initial;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  /** Gives back the focus `closed` took, as its kind does; a toast took none. */
  const giveBack = (closed: Overlay | undefined, toPage: boolean) => {
    if (!closed || takesNoFocus(closed)) {
      return;
    }

    focus.focus(
      isMenu(closed) && !toPage
        ? [{ kind: "shell" }]
        : [{ kind: "front" }, { kind: "shell" }]
    );
  };

  const show = (overlay: Overlay, takeFocus: boolean) => {
    if (!view) {
      log(`The ${overlay.kind} overlay has no view to open in yet`);

      return;
    }

    const replaced = open;

    clearTimeout(toastTimer);
    view.setBounds(bounds(overlay));
    view.show();
    open = overlay;

    if (overlay.kind === "toast") {
      toastTimer = setTimeout(() => {
        if (open === overlay) {
          // oxlint-disable-next-line no-use-before-define -- the toast's timer closes it
          hide();
        }
      }, TOAST_DURATION);
    }

    if (takeFocus && !takesNoFocus(overlay)) {
      focus.focus([{ kind: "overlay" }]);
    }

    notify();

    if (!takeFocus || takesNoFocus(overlay)) {
      // What it replaced gives its own focus back, since this takes none.
      giveBack(replaced, false);
    }
  };

  const hide = ({ toPage = false } = {}) => {
    const closed = open;

    clearTimeout(toastTimer);
    open = undefined;
    view?.hide();
    notify();
    giveBack(closed, toPage);
  };

  const dispatch = (event: OverlayEvent, closing = {}, takeFocus = true) => {
    const next = transitionOverlay(open, event);

    if (isEqual(next, open)) {
      return;
    }

    if (next) {
      show(next, takeFocus);
    } else {
      hide(closing);
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
    /**
     * Opens `overlay` in place of what is open; without `takeFocus` it
     * leaves focus where it is, as the find bar shown again on its tab's
     * return does.
     */
    open: (overlay: Overlay, { takeFocus = true } = {}) => {
      dispatch({ kind: "open", overlay }, {}, takeFocus);
    },
    /**
     * Closes what is open; `toPage` gives focus to the page even from a menu,
     * as when the window losing focus closed it.
     */
    close: ({ toPage = false } = {}) => {
      dispatch({ kind: "close" }, { toPage });
    },
    /** Told of each change of main's state, which may close what is open. */
    follow: (next: State) => {
      const previous = state;

      state = next;
      // A menu closed by another profile selected gives focus to its page.
      dispatch(
        { kind: "state-changed", previous, next },
        { toPage: previous.selectedProfileId !== next.selectedProfileId }
      );
    },
    /** Places the view again, as the window now has it. */
    relayout: () => {
      if (open && view) {
        view.setBounds(bounds(open));
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
