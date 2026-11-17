import { describe, expect, it } from "vitest";

import { newProfile, selectProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { createFocus } from "./focus.ts";
import { createOverlays } from "./overlay.ts";

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
    bounds: (overlay) => ({ ...bounds, x: overlay.profileId === "a" ? 1 : 2 }),
    log: (message) => events.push(`log ${message}`),
  });

  overlays.onChange(() => {
    events.push(`shell told ${overlays.current()?.profileId ?? "closed"}`);
  });

  const adopt = () => {
    overlays.adopt({
      webContentsId: 3,
      setBounds: (rectangle) => events.push(`bounds ${rectangle.x}`),
      show: () => events.push("show"),
      hide: () => events.push("hide"),
      focus: () => {
        events.push("focus overlay");
        focus.noteFocused({ kind: "overlay" });
      },
      onFocus: () => false,
      onDestroyed: (listener) => {
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
      "bounds 1",
      "show",
      "focus overlay",
      "shell told a",
      "hide",
      "shell told closed",
      "focus front",
    ]);
    expect(overlays.current()).toBeUndefined();
  });

  it("replaces an open overlay with the next, and gives focus back to what had it before the first", () => {
    const { overlays, focus, events } = setup();

    focus.noteFocused({ kind: "shell" });
    overlays.open(renameA);
    overlays.open(renameB);
    events.length = 0;
    overlays.close();

    expect(events).toStrictEqual(["hide", "shell told closed", "focus shell"]);
  });

  it("gives focus to the selected tab's view when what had it is gone", () => {
    const { overlays, focus, events, present } = setup();

    focus.noteFocused({ kind: "shell" });
    overlays.open(renameA);
    present.delete("shell");
    events.length = 0;
    overlays.close();

    expect(events.at(-1)).toBe("focus front");
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
      "bounds 2",
      "bounds 2",
    ]);
  });
});
