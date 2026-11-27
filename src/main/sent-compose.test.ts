import { isEqual } from "es-toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Overlay } from "#core/overlay.ts";
import type { SentWindows } from "#platform/sent-windows.ts";

import { SENT_WINDOW_BOUND_MS, createSentCompose } from "./sent-compose.ts";

/**
 * The overlays as main's own keep them: one open, each change told, one
 * equal to what is open leaving it as it is.
 */
const fakeOverlays = () => {
  let open: Overlay | undefined;
  const listeners = new Set<() => void>();
  const set = (next: Overlay | undefined) => {
    if (isEqual(next, open)) {
      return;
    }

    open = next;

    for (const listener of listeners) {
      listener();
    }
  };

  return {
    open: (overlay: Overlay) => {
      set(overlay);
    },
    close: () => {
      set(undefined);
    },
    current: () => open,
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

/** Compose windows by web contents, each shown until hidden or closed. */
const fakeWindows = (ids: number[]) => {
  const state = new Map<number, "shown" | "hidden" | "closed">(
    ids.map((id) => [id, "shown"])
  );
  const closedListeners = new Map<number, (() => void)[]>();
  const closed = (id: number) => {
    state.set(id, "closed");

    for (const listener of closedListeners.get(id) ?? []) {
      listener();
    }

    closedListeners.delete(id);
  };
  const windows: SentWindows = {
    hide: (id) => {
      state.set(id, "hidden");
    },
    show: (id) => {
      state.set(id, "shown");
    },
    destroy: closed,
    onClosed: (id, listener) => {
      closedListeners.set(id, [...(closedListeners.get(id) ?? []), listener]);
    },
  };

  return { windows, state: (id: number) => state.get(id), closed };
};

const SENT_TOAST: Overlay = { kind: "toast", message: "message-sent" };

const setup = ({ enabled = true } = {}) => {
  const overlays = fakeOverlays();
  const { windows, state, closed } = fakeWindows([1, 2]);
  const undone: number[] = [];
  const sent = createSentCompose({
    enabled: () => enabled,
    windows,
    overlays,
    undoPage: (id) => {
      undone.push(id);
    },
  });

  return { overlays, state, closed, undone, sent };
};

describe(createSentCompose, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides the window at once as its send shows, and says so with Undo", () => {
    const { overlays, state, sent } = setup();

    sent.notice(1, "shown");

    expect([state(1), overlays.current()]).toStrictEqual([
      "hidden",
      SENT_TOAST,
    ]);
  });

  it("presses Gmail's Undo in that page and shows the window again on Undo", () => {
    const { overlays, state, undone, sent } = setup();

    sent.notice(1, "shown");
    // The press on Undo closes the toast before the shell's call arrives.
    overlays.close();
    sent.undo();

    expect([state(1), undone, overlays.current()]).toStrictEqual([
      "shown",
      [1],
      undefined,
    ]);

    // Taken back, it is no longer waiting: the bound leaves it be.
    vi.advanceTimersByTime(SENT_WINDOW_BOUND_MS);

    expect(state(1)).toBe("shown");
  });

  it("closes the window once the toast has ended and Gmail's notice gone, in that order", () => {
    const { overlays, state, sent } = setup();

    sent.notice(1, "shown");
    overlays.close();

    expect(state(1)).toBe("hidden");

    sent.notice(1, "gone");

    expect(state(1)).toBe("closed");
  });

  it("dismisses the toast when Gmail's notice goes first, offering no Undo it cannot keep, and closes the window", () => {
    const { overlays, state, undone, sent } = setup();

    sent.notice(1, "shown");
    sent.notice(1, "gone");

    expect([overlays.current(), state(1)]).toStrictEqual([undefined, "closed"]);

    sent.undo();

    expect(undone).toStrictEqual([]);
  });

  it("closes a window whose notice never goes at the bound", () => {
    const { overlays, state, sent } = setup();

    sent.notice(1, "shown");
    overlays.close();
    vi.advanceTimersByTime(SENT_WINDOW_BOUND_MS - 1);

    expect(state(1)).toBe("hidden");

    vi.advanceTimersByTime(1);

    expect(state(1)).toBe("closed");
  });

  it("does nothing with the setting off", () => {
    const { overlays, state, sent } = setup({ enabled: false });

    sent.notice(1, "shown");
    sent.notice(1, "gone");

    expect([state(1), overlays.current()]).toStrictEqual(["shown", undefined]);
  });

  it("keeps the window while another notice replaces its toast, closing it once its own notice goes", () => {
    const { overlays, state, sent } = setup();

    sent.notice(1, "shown");
    overlays.open({ kind: "toast", message: "bookmarked" });

    expect(state(1)).toBe("hidden");

    sent.notice(1, "gone");

    expect([state(1), overlays.current()]).toStrictEqual([
      "closed",
      { kind: "toast", message: "bookmarked" },
    ]);
  });

  it("offers Undo for the latest send alone, closing the earlier window once its notice goes", () => {
    const { overlays, state, undone, sent } = setup();

    sent.notice(1, "shown");
    sent.notice(2, "shown");
    sent.notice(1, "gone");

    expect([state(1), state(2), overlays.current()]).toStrictEqual([
      "closed",
      "hidden",
      SENT_TOAST,
    ]);

    sent.undo();

    expect([undone, state(2)]).toStrictEqual([[2], "shown"]);
  });

  it("forgets a window closed from elsewhere, so its toast goes and Undo presses nothing", () => {
    const { overlays, closed, undone, sent } = setup();

    sent.notice(1, "shown");
    closed(1);
    sent.undo();

    expect([overlays.current(), undone]).toStrictEqual([undefined, []]);
  });

  it("hides a window once however often its notice shows while it waits", () => {
    const { overlays, sent } = setup();

    sent.notice(1, "shown");
    overlays.close();
    sent.notice(1, "shown");

    expect(overlays.current()).toBeUndefined();
  });
});
