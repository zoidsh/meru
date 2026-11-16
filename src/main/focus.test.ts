import { describe, expect, it } from "vitest";

import { createFocus } from "./focus.ts";
import type { FocusTarget } from "./focus.ts";

const name = (target: FocusTarget) =>
  target.kind === "tab"
    ? `${target.key.profileId}/${target.key.tabId}`
    : target.kind;

/** A window and web contents that record which of them was focused, in order. */
const setup = ({ focusWhileInactive = false } = {}) => {
  const listeners = new Map<string, (() => void)[]>();
  const focused: string[] = [];
  const window = { focused: false, visible: false };
  /** The web contents there to focus, by name; a gone one is missing. */
  const present = new Set(["shell", "overlay", "a/gmail", "front"]);

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
      present.has(name(target))
        ? () => {
            focused.push(name(target));
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

const gmail: FocusTarget = {
  kind: "tab",
  key: { profileId: "a", tabId: "gmail" },
};

describe(createFocus, () => {
  it("focuses the first preference there to focus, at once while the window has focus", () => {
    const { focus, focused, window, present } = setup();

    window.focused = true;
    focus.focus([gmail, { kind: "front" }]);
    present.delete("a/gmail");
    focus.focus([gmail, { kind: "front" }, { kind: "shell" }]);
    present.delete("front");
    focus.focus([gmail, { kind: "front" }, { kind: "shell" }]);

    expect(focused).toStrictEqual(["a/gmail", "front", "shell"]);
  });

  it("waits until the window has focus, and then focuses only the last asked for", () => {
    const { focus, focused, window, emit } = setup();

    window.visible = true;
    focus.focus([{ kind: "overlay" }]);
    focus.focus([gmail]);
    emit("show");

    expect(focused).toStrictEqual([]);

    window.focused = true;
    emit("focus");
    emit("focus");

    expect(focused).toStrictEqual(["a/gmail"]);
  });

  it("chooses when the window comes forward, so a view gone meanwhile is passed over", () => {
    const { focus, focused, window, present, emit } = setup();

    focus.focus([gmail, { kind: "front" }]);
    present.delete("a/gmail");
    window.focused = true;
    emit("focus");

    expect(focused).toStrictEqual(["front"]);
  });

  it("where the app can never be activated, focuses once the window shows, focused or not", () => {
    const { focus, focused, window, emit } = setup({
      focusWhileInactive: true,
    });

    focus.focus([gmail]);

    expect(focused).toStrictEqual([]);

    window.visible = true;
    emit("show");
    focus.focus([{ kind: "shell" }]);

    expect(focused).toStrictEqual(["a/gmail", "shell"]);
  });

  it("remembers which web contents last gained focus", () => {
    const { focus } = setup();

    expect(focus.focused()).toBeUndefined();

    focus.noteFocused(gmail);
    focus.noteFocused({ kind: "overlay" });

    expect(focus.focused()).toStrictEqual({ kind: "overlay" });
  });
});
