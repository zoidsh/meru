import { describe, expect, it, vi } from "vitest";

import { newProfile, selectProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { createFocus } from "./focus.ts";
import { TOAST_DURATION, createOverlays } from "./overlay.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Profile 2")],
  selectedProfileId: "a",
};

/**
 * Overlays over the real focus, in a focused window whose web contents
 * record each focus and report it as gained, and a fake overlay view.
 */
const setup = () => {
  /** What happened, in order: the view's changes, focus and the shell told. */
  const events: string[] = [];
  const present = new Set<string>(["shell", "front"]);
  let destroy: (() => void) | undefined;
  let bounds = { x: 0, y: 0, width: 100, height: 50 };

  const focus = createFocus({
    window: { isFocused: () => true, isVisible: () => true, on: () => false },
    focusWhileInactive: false,
    resolve: (target) => {
      if (target.kind === "overlay") {
        // oxlint-disable-next-line no-use-before-define -- resolved when focus moves
        return overlays.focuser();
      }

      return present.has(target.kind)
        ? () => {
            events.push(`focus ${target.kind}`);
            focus.noteFocused(target);
          }
        : undefined;
    },
  });

  const overlays = createOverlays({
    focus,
    initial: two,
    bounds: () => bounds,
    log: (message) => events.push(`log ${message}`),
  });

  overlays.onChange(() => {
    const current = overlays.current();

    events.push(
      `shell told ${current?.kind === "rename-profile" ? current.profileId : (current?.kind ?? "closed")}`
    );
  });

  const adopt = () => {
    overlays.adopt({
      webContentsId: 3,
      setBounds: (rectangle) => events.push(`bounds ${rectangle.width}`),
      show: () => events.push("show"),
      hide: () => events.push("hide"),
      focus: () => {
        events.push("focus overlay");
        focus.noteFocused({ kind: "overlay" });
      },
      onFocus: () => false,
      onKey: () => false,
      moveUnder: () => false,
      onGone: (listener) => {
        destroy = listener;
      },
      close: () => false,
    });
  };

  adopt();

  return {
    overlays,
    focus,
    events,
    present,
    adopt,
    destroy: () => destroy?.(),
    resize: (next: typeof bounds) => {
      bounds = next;
    },
  };
};

const renameA = { kind: "rename-profile", profileId: "a" } as const;
const renameB = { kind: "rename-profile", profileId: "b" } as const;

describe(createOverlays, () => {
  it("shows and focuses the view before the shell hears, and hides it and gives focus back on close", () => {
    const { overlays, focus, events } = setup();

    focus.noteFocused({ kind: "front" });
    overlays.open(renameA);
    overlays.close();

    expect(events).toStrictEqual([
      "bounds 100",
      "show",
      "focus overlay",
      "shell told a",
      "hide",
      "shell told closed",
      "focus front",
    ]);
    expect(overlays.current()).toBeUndefined();
  });

  it("shows a toast without taking focus, and gives none back when it closes by itself", () => {
    vi.useFakeTimers();

    const { overlays, focus, events } = setup();

    focus.noteFocused({ kind: "front" });
    overlays.open({ kind: "toast", message: "no-room" });
    vi.advanceTimersByTime(TOAST_DURATION);

    expect(events).toStrictEqual([
      "bounds 100",
      "show",
      "shell told toast",
      "hide",
      "shell told closed",
    ]);
    vi.useRealTimers();
  });

  it("shows where a dragged tab would land without taking focus from the page, and gives none back when it closes", () => {
    const { overlays, focus, events } = setup();

    focus.noteFocused({ kind: "front" });
    overlays.open({
      kind: "drop",
      zone: { x: 0, y: 0, width: 50, height: 100 },
      along: "pane",
      fits: true,
    });
    overlays.close();

    expect(events).toStrictEqual([
      "bounds 100",
      "show",
      "shell told drop",
      "hide",
      "shell told closed",
    ]);
  });

  it("gives back the focus a card or a menu took when a toast replaces it", () => {
    const { overlays, focus, events } = setup();

    focus.noteFocused({ kind: "front" });
    overlays.open({
      kind: "tab-menu",
      profileId: "a",
      tabId: "gmail",
      x: 10,
      y: 60,
    });
    events.length = 0;
    overlays.open({ kind: "toast", message: "no-room" });

    expect(events).toStrictEqual([
      "bounds 100",
      "show",
      "shell told toast",
      "focus shell",
    ]);

    overlays.open(renameA);
    events.length = 0;
    overlays.open({ kind: "toast", message: "no-room" });

    expect(events).toStrictEqual([
      "bounds 100",
      "show",
      "shell told toast",
      "focus front",
    ]);
  });

  it("gives focus to the shell when a tab's menu closes, which puts it on the menu's tab", () => {
    const { overlays, focus, events } = setup();

    focus.noteFocused({ kind: "front" });
    overlays.open({
      kind: "tab-menu",
      profileId: "a",
      tabId: "gmail",
      x: 10,
      y: 60,
    });
    events.length = 0;
    overlays.close();

    expect(events).toStrictEqual(["hide", "shell told closed", "focus shell"]);
  });

  it("gives focus to the shell when a profile's menu closes, which puts it on the profile's button", () => {
    const { overlays, focus, events } = setup();

    focus.noteFocused({ kind: "front" });
    overlays.open({ kind: "profile-menu", profileId: "b", x: 120, y: 20 });
    events.length = 0;
    overlays.close();

    expect(events).toStrictEqual(["hide", "shell told closed", "focus shell"]);
  });

  it("gives focus to the page when the window losing focus closes a tab's menu", () => {
    const { overlays, focus, events } = setup();

    focus.noteFocused({ kind: "front" });
    overlays.open({
      kind: "tab-menu",
      profileId: "a",
      tabId: "gmail",
      x: 10,
      y: 60,
    });
    events.length = 0;
    overlays.close({ toPage: true });

    expect(events).toStrictEqual(["hide", "shell told closed", "focus front"]);
  });

  it("gives focus to the page when another profile selected closes a profile's menu", () => {
    const { overlays, focus, events } = setup();

    focus.noteFocused({ kind: "front" });
    overlays.open({ kind: "profile-menu", profileId: "a", x: 120, y: 20 });
    events.length = 0;
    overlays.follow(selectProfile(two, "b") as State);

    expect(events).toStrictEqual(["hide", "shell told closed", "focus front"]);
  });

  it("replaces an open overlay with the next, and gives focus to the page, not the shell whose button opened it", () => {
    const { overlays, focus, events } = setup();

    focus.noteFocused({ kind: "shell" });
    overlays.open(renameA);
    overlays.open(renameB);
    events.length = 0;
    overlays.close();

    expect(events).toStrictEqual(["hide", "shell told closed", "focus front"]);
  });

  it("gives focus to the shell when there is no selected tab's view", () => {
    const { overlays, focus, events, present } = setup();

    focus.noteFocused({ kind: "front" });
    overlays.open(renameA);
    present.delete("front");
    events.length = 0;
    overlays.close();

    expect(events.at(-1)).toBe("focus shell");
  });

  it("closes when another profile is selected, and stays through a change that leaves what is underneath", () => {
    const { overlays } = setup();
    const renamed = {
      ...two,
      profiles: [newProfile("a", "Work"), two.profiles[1]],
    } as State;

    overlays.open(renameA);
    overlays.follow(renamed);

    expect(overlays.current()).toStrictEqual(renameA);

    overlays.follow(selectProfile(renamed, "b") as State);

    expect(overlays.current()).toBeUndefined();
  });

  it("does nothing on a close with nothing open, or on opening what is open", () => {
    const { overlays, events } = setup();

    overlays.close();
    overlays.open(renameA);
    events.length = 0;
    overlays.open(renameA);

    expect(events).toStrictEqual([]);
  });

  it("opens nothing before the shell has made its view, and closes when the view goes", () => {
    const { overlays, events, destroy, adopt } = setup();

    destroy();
    overlays.open(renameA);

    expect(overlays.current()).toBeUndefined();
    expect(events).toStrictEqual([
      "log The rename-profile overlay has no view to open in yet",
    ]);

    adopt();
    overlays.open(renameA);
    destroy();

    expect(overlays.current()).toBeUndefined();
    expect(events.at(-2)).toBe("shell told closed");
  });

  it("places the open view again when asked", () => {
    const { overlays, events, resize } = setup();

    overlays.relayout();
    overlays.open(renameB);
    resize({ x: 0, y: 0, width: 50, height: 50 });
    overlays.relayout();

    expect(events.filter((event) => event.startsWith("bounds"))).toStrictEqual([
      "bounds 100",
      "bounds 50",
    ]);
  });
});
