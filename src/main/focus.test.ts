import { describe, expect, it } from "vitest";

import { createFocus } from "./focus.ts";
import type { FocusTarget } from "./focus.ts";

/** A window and web contents that record which of them was focused, in order. */
const setup = ({ focusWhileInactive = false } = {}) => {
  const listeners = new Map<string, (() => void)[]>();
  const focused: string[] = [];
  const window = { focused: false, visible: false };
  /** The web contents there to focus, by name; a gone one is missing. */
  const present = new Set(["shell", "overlay", "front", "window"]);

  const focus = createFocus({
    window: {
      isFocused: () => window.focused,
      isVisible: () => window.visible,
      on: (event, listener) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      },
    },
    focusWhileInactive,
    resolve: (target) =>
      present.has(target.kind)
        ? () => {
            focused.push(target.kind);
          }
        : undefined,
  });

  const emit = (event: string) => {
    for (const listener of listeners.get(event) ?? []) {
      listener();
    }
  };

  return { focus, focused, window, present, emit };
};

const overlay: FocusTarget = { kind: "overlay" };

describe(createFocus, () => {
  it("focuses the first preference there to focus, at once while the window has focus", () => {
    const { focus, focused, window, present } = setup();

    window.focused = true;
    focus.focus([overlay, { kind: "front" }]);
    present.delete("overlay");
    focus.focus([overlay, { kind: "front" }, { kind: "shell" }]);
    present.delete("front");
    focus.focus([overlay, { kind: "front" }, { kind: "shell" }]);

    expect(focused).toStrictEqual(["overlay", "front", "shell"]);
  });

  it("waits until the window has focus, and then focuses only the last asked for", () => {
    const { focus, focused, window, emit } = setup();

    window.visible = true;
    focus.focus([{ kind: "shell" }]);
    focus.focus([overlay]);
    emit("show");

    expect(focused).toStrictEqual([]);

    window.focused = true;
    emit("focus");
    emit("focus");

    expect(focused).toStrictEqual(["overlay"]);
  });

  it("chooses when the window comes forward, so a view gone meanwhile is passed over", () => {
    const { focus, focused, window, present, emit } = setup();

    focus.focus([overlay, { kind: "front" }]);
    present.delete("overlay");
    window.focused = true;
    emit("focus");

    expect(focused).toStrictEqual(["front"]);
  });

  it("where the app can never be activated, focuses once the window shows, focused or not", () => {
    const { focus, focused, window, emit } = setup({
      focusWhileInactive: true,
    });

    focus.focus([overlay]);

    expect(focused).toStrictEqual([]);

    window.visible = true;
    emit("show");
    focus.focus([{ kind: "shell" }]);

    expect(focused).toStrictEqual(["overlay", "shell"]);
  });

  it("remembers which web contents last gained focus", () => {
    const { focus } = setup();

    expect(focus.focused()).toBeUndefined();

    focus.noteFocused({ kind: "front" });
    focus.noteFocused(overlay);

    expect(focus.focused()).toStrictEqual(overlay);
  });

  it("gives focus taken unasked back to what held it, an overlay keeping it, or the front page", () => {
    const { focus, focused, window, present } = setup();

    window.focused = true;
    focus.giveBack();
    focus.noteFocused(overlay);
    focus.giveBack();
    present.delete("overlay");
    focus.giveBack();

    expect(focused).toStrictEqual(["front", "overlay", "front"]);
  });

  it("never gives focus back to a tab's own window, but to the front tab's view", () => {
    const { focus, focused, window } = setup();

    window.focused = true;
    focus.noteFocused({ kind: "window", key: { profileId: "p", tabId: "c" } });
    focus.giveBack();

    expect(focused).toStrictEqual(["front"]);
  });

  it("gives nothing back while the window is in the background until it comes forward, and leaves a move already waiting", () => {
    const { focus, focused, window, emit } = setup();

    focus.noteFocused(overlay);
    focus.giveBack();

    const behind = [...focused];

    window.focused = true;
    emit("focus");
    window.focused = false;
    focus.focus([{ kind: "shell" }]);
    focus.giveBack();
    window.focused = true;
    emit("focus");

    expect([behind, focused]).toStrictEqual([[], ["overlay", "shell"]]);
  });
});
