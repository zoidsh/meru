import type { TabKey } from "#core/tabs.ts";
import type { AppWindow } from "#platform/window.ts";

/** A web contents of the window that can hold keyboard focus. */
export type FocusTarget =
  | { kind: "shell" }
  | { kind: "overlay" }
  | { kind: "tab"; key: TabKey }
  /** The selected tab's view, whichever that is when focus moves. */
  | { kind: "front" };

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
}: FocusDeps) => {
  let focused: FocusTarget | undefined;
  let pending: readonly FocusTarget[] | undefined;

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

  window.on("focus", flush);
  window.on("show", flush);

  return {
    /** Told by each web contents as it gains focus. */
    noteFocused: (target: FocusTarget) => {
      focused = target;
    },
    /** The web contents that last gained focus. */
    focused: () => focused,
    /** Focuses the first of `preferences` that is there to focus. */
    focus: (preferences: readonly FocusTarget[]) => {
      pending = preferences;
      flush();
    },
  };
};

export type Focus = ReturnType<typeof createFocus>;
