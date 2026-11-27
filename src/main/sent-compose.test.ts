import { isEqual } from "es-toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Overlay } from "#core/overlay.ts";
import type { SentWindows } from "#platform/sent-windows.ts";

import { SENT_WINDOW_BOUND_MS, createSentCompose } from "./sent-compose.ts";

/**
 * The overlays as main's own keep them: one open, each change told, one
 * equal to what is open leaving it as it is.
 */
const fakeOverlays = (initial?: Overlay) => {
  let open = initial;
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
    webContentsId: () => 7,
  };
};

/** Compose windows by web contents, each shown until hidden or closed. */
const fakeWindows = (ids: number[]) => {
  const state = new Map<number, "shown" | "hidden" | "closed">(
    ids.map((id) => [id, "shown"])
  );
  const throttled = new Map<number, boolean>(ids.map((id) => [id, true]));
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
    setThrottling: (id, on) => {
      throttled.set(id, on);
    },
    onClosed: (id, listener) => {
      closedListeners.set(id, [...(closedListeners.get(id) ?? []), listener]);
    },
  };

  return {
    windows,
    state: (id: number) => state.get(id),
    throttled: (id: number) => throttled.get(id),
    listeners: (id: number) => closedListeners.get(id)?.length ?? 0,
    closed,
  };
};

const SENT_TOAST: Overlay = { kind: "toast", message: "message-sent" };

const setup = ({
  enabled = true,
  mainShown = true,
  open,
}: { enabled?: boolean; mainShown?: boolean; open?: Overlay } = {}) => {
  const overlays = fakeOverlays(open);
  const fake = fakeWindows([1, 2]);
  const undone: number[] = [];
  const released: number[] = [];
  let shown = mainShown;
  const sent = createSentCompose({
    enabled: () => enabled,
    windows: fake.windows,
    overlays,
    mainWindowShown: () => shown,
    undoPage: (id) => {
      undone.push(id);
    },
    released: (id) => {
      released.push(id);
    },
  });

  return {
    ...fake,
    overlays,
    undone,
    released,
    sent,
    showMain: (next: boolean) => {
      shown = next;
    },
  };
};

describe(createSentCompose, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides the window at once as its send shows, its timers kept on time, and says so with Undo", () => {
    const { overlays, state, throttled, sent } = setup();

    sent.notice(1, "shown");

    expect([state(1), throttled(1), overlays.current()]).toStrictEqual([
      "hidden",
      false,
      SENT_TOAST,
    ]);
  });

  it("presses Gmail's Undo in that page and shows the window again on Undo, its timers as any other's", () => {
    const { overlays, state, throttled, undone, released, sent } = setup();

    sent.notice(1, "shown");
    // The press on Undo closes the toast before the shell's call arrives.
    overlays.close();
    sent.undo();

    expect([
      state(1),
      throttled(1),
      undone,
      released,
      overlays.current(),
    ]).toStrictEqual(["shown", true, [1], [1], undefined]);

    // Taken back, it is no longer waiting: the bound leaves it be.
    vi.advanceTimersByTime(SENT_WINDOW_BOUND_MS);

    expect([state(1), sent.waits(1)]).toStrictEqual(["shown", false]);
  });

  it("closes the window once the toast has ended and Gmail's notice gone, in that order", () => {
    const { overlays, state, sent } = setup();

    sent.notice(1, "shown");
    overlays.close();

    expect([state(1), sent.waits(1)]).toStrictEqual(["hidden", true]);

    sent.notice(1, "gone");

    expect([state(1), sent.waits(1)]).toStrictEqual(["closed", false]);
  });

  it("dismisses the toast when Gmail's notice goes first, offering no Undo it cannot keep, and closes the window", () => {
    const { overlays, state, undone, sent } = setup();

    sent.notice(1, "shown");
    sent.notice(1, "gone");

    expect([overlays.current(), state(1)]).toStrictEqual([undefined, "closed"]);

    sent.undo();

    expect(undone).toStrictEqual([]);
  });

  it("takes a hidden window's notice going with a compose in its page for its send gone, since nobody presses Undo in a hidden page", () => {
    const { overlays, state, sent } = setup();

    sent.notice(1, "shown");
    overlays.close();
    sent.notice(1, "undone");

    expect([state(1), sent.waits(1)]).toStrictEqual(["closed", false]);
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

    expect([state(1), overlays.current(), sent.waits(1)]).toStrictEqual([
      "shown",
      undefined,
      false,
    ]);
  });

  it.each([
    ["the main window hidden or minimized", { mainShown: false }],
    [
      "the profile question open",
      {
        open: {
          kind: "profile-question",
          profileIds: ["a", "b"],
        } satisfies Overlay,
      },
    ],
    ["a card open", { open: { kind: "downloads" } satisfies Overlay }],
    [
      "the find bar open",
      {
        open: {
          kind: "find",
          profileId: "a",
          tabId: "t",
        } satisfies Overlay,
      },
    ],
  ])(
    "with %s, leaves the window as Gmail does, replacing nothing, and closes it once the notice has gone",
    (_what, options) => {
      const { overlays, state, throttled, sent } = setup(options);
      const before = overlays.current();

      sent.notice(1, "shown");

      expect([state(1), throttled(1), overlays.current()]).toStrictEqual([
        "shown",
        true,
        before,
      ]);

      sent.undo();

      expect(state(1)).toBe("shown");

      sent.notice(1, "gone");

      expect([state(1), overlays.current()]).toStrictEqual(["closed", before]);
    }
  );

  it("leaves a window shown as Gmail leaves it be once Gmail's own Undo there brings the draft back", () => {
    const { state, sent } = setup({ mainShown: false });

    sent.notice(1, "shown");
    sent.notice(1, "undone");
    vi.advanceTimersByTime(SENT_WINDOW_BOUND_MS);

    expect([state(1), sent.waits(1)]).toStrictEqual(["shown", false]);
  });

  it("lets a window in view go at the bound, never closing it, since a person may be writing there", () => {
    const { state, released, sent } = setup({ mainShown: false });

    sent.notice(1, "shown");
    vi.advanceTimersByTime(SENT_WINDOW_BOUND_MS);

    expect([state(1), sent.waits(1), released]).toStrictEqual([
      "shown",
      false,
      [1],
    ]);

    sent.notice(1, "gone");

    expect(state(1)).toBe("shown");
  });

  it("shows its toast over another toast, which replaces nothing a person is answering", () => {
    const { overlays, state, sent } = setup({
      open: { kind: "toast", message: "bookmark-removed" },
    });

    sent.notice(1, "shown");

    expect([state(1), overlays.current()]).toStrictEqual([
      "hidden",
      SENT_TOAST,
    ]);
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
    const { overlays, closed, undone, released, sent } = setup();

    sent.notice(1, "shown");
    closed(1);
    sent.undo();

    expect([overlays.current(), undone, released]).toStrictEqual([
      undefined,
      [],
      [1],
    ]);
  });

  it("hears a window's closing once however often it sends", () => {
    const { overlays, listeners, sent } = setup();

    sent.notice(1, "shown");
    overlays.close();
    sent.undo();
    sent.notice(1, "shown");
    sent.notice(1, "shown");

    expect(listeners(1)).toBe(1);
  });

  it("finishes a window already waiting as it started when the setting goes off, Undo and closing alike", () => {
    let enabled = true;
    const overlays = fakeOverlays();
    const fake = fakeWindows([1, 2]);
    const undone: number[] = [];
    const sent = createSentCompose({
      enabled: () => enabled,
      windows: fake.windows,
      overlays,
      mainWindowShown: () => true,
      undoPage: (id) => {
        undone.push(id);
      },
      released: () => {},
    });

    sent.notice(1, "shown");
    sent.notice(2, "shown");
    enabled = false;

    // Its watch goes on while it waits.
    expect([sent.waits(1), sent.waits(2)]).toStrictEqual([true, true]);

    sent.undo();
    sent.notice(1, "gone");

    expect([undone, fake.state(2), fake.state(1)]).toStrictEqual([
      [2],
      "shown",
      "closed",
    ]);
  });
});
