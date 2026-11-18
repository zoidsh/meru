import type { TabKey } from "#core/tabs.ts";
import type { AppWindow } from "#platform/window.ts";

/** A web contents of the app's windows that can hold keyboard focus. */
export type FocusTarget =
  | { kind: "shell" }
  | { kind: "overlay" }
  /** The selected tab's view, whichever that is when focus moves. */
  | { kind: "front" }
  /** The page of a tab in its own window, or that window's titlebar. */
  | { kind: "window"; key: TabKey };

export interface FocusDeps {
  window: Pick<AppWindow, "isFocused" | "isVisible" | "on">;
  /**
   * Focus may move while the window is not the one keys go to. Only where
   * the app can never be activated, as under the test flag, since focusing a
   * page brings its window forward and activates the app.
   */
  focusWhileInactive: boolean;
  /** What focuses `target`; nothing when it is gone or not showing. */
  resolve: (target: FocusTarget) => (() => void) | undefined;
  /**
   * Whether a card or a menu is open over the pages, which no page can be
   * clicked through, so a page that takes focus took it unasked.
   */
  overlayCoversPages: () => boolean;
}

/**
 * Where keyboard focus is among the window's web contents, and moving it.
 * A move asked for while the window is in the background waits until the
 * window comes forward, so it never brings it forward itself.
 */
export const createFocus = ({
  window,
  focusWhileInactive,
  resolve,
  overlayCoversPages,
}: FocusDeps) => {
  let focused: FocusTarget | undefined;
  let pending: readonly FocusTarget[] | undefined;
  const listeners = new Set<() => void>();

  const mayFocus = () =>
    window.isFocused() || (focusWhileInactive && window.isVisible());

  const apply = (preferences: readonly FocusTarget[]) => {
    for (const target of preferences) {
      const focus = resolve(target);

      if (focus) {
        focus();

        return;
      }
    }
  };

  const flush = () => {
    if (pending && mayFocus()) {
      const preferences = pending;

      pending = undefined;
      apply(preferences);
    }
  };

  /**
   * Gives focus a page took back to the overlay covering it, on the next
   * turn: on Linux a focus moved while the page's own gain is still being
   * told of is lost.
   */
  const takeBackForOverlay = () => {
    setTimeout(() => {
      if (overlayCoversPages()) {
        pending = [{ kind: "overlay" }];
        flush();
      }
    }, 0);
  };

  window.on("focus", flush);
  window.on("show", flush);

  const noteFocused = (target: FocusTarget) => {
    focused = target;

    for (const listener of listeners) {
      listener();
    }
  };

  return {
    /** Told by each web contents as it gains focus. */
    noteFocused,
    /** Told each time a web contents gains focus. */
    onFocused: (listener: () => void) => {
      listeners.add(listener);
    },
    /** The web contents that last gained focus. */
    focused: () => focused,
    /** Focuses the first of `preferences` that is there to focus. */
    focus: (preferences: readonly FocusTarget[]) => {
      pending = preferences;
      flush();
    },
    /**
     * Told as the main window's front page gains focus: noted, unless a card
     * or a menu covers the pages, which takes it back, as a page that grabs
     * focus for a field of its own would leave the card's field dead.
     */
    frontFocused: () => {
      if (overlayCoversPages()) {
        takeBackForOverlay();

        return;
      }

      noteFocused({ kind: "front" });
    },
    /**
     * Gives focus back to the main window's web contents that held it, or
     * the front tab's view, after one took it unasked, as a pane's page can
     * as it first loads; a move already waiting for the window wins. Never
     * to a tab's own window, which would come forward over the main one.
     * While a card or a menu covers the pages, the overlay takes it.
     */
    giveBack: () => {
      if (pending) {
        return;
      }

      if (overlayCoversPages()) {
        takeBackForOverlay();

        return;
      }

      pending = [
        ...(focused && focused.kind !== "window" ? [focused] : []),
        { kind: "front" },
        { kind: "shell" },
      ];
      flush();
    },
  };
};

export type Focus = ReturnType<typeof createFocus>;
