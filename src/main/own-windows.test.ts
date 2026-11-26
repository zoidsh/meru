import { noop } from "es-toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APPS } from "#core/apps.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { tabKey } from "#core/tabs.ts";
import type { Rectangle } from "#core/window-bounds.ts";
import type { BaseWindowOptions } from "#platform/base-window.ts";
import type { OverlayView } from "#platform/overlay-view.ts";
import type { OwnWindow } from "#platform/own-window.ts";

import { createOwnWindows } from "./own-windows.ts";

const CALENDAR = { profileId: "p", tabId: "c1" };

const SAVED = { x: 100, y: 80, width: 900, height: 600 };

const stateWith = (ownWindow: boolean): State => ({
  version: 1,
  profiles: [
    {
      ...newProfile("p", "Default"),
      tabs: [
        gmailTab(),
        {
          id: "c1",
          app: "calendar",
          url: "https://calendar.google.com/",
          title: "Week",
          windowBounds: SAVED,
          ...(ownWindow && { ownWindow: true }),
        },
      ],
    },
  ],
  selectedProfileId: "p",
});

interface FakeWindow {
  options: BaseWindowOptions;
  calls: string[];
  bounds: Rectangle;
  minimized: boolean;
  destroyed: boolean;
  resize: () => void;
  move: () => void;
  focus: () => void;
  blur: () => void;
  endSession: () => void;
  /** Asks it to close by its control; says whether it was kept open. */
  close: () => boolean;
}

const setup = ({ background = true, holdSaves = false } = {}) => {
  let state = stateWith(true);
  const heldSaves: (() => void)[] = [];
  let color = "#eeeeee";
  const created: FakeWindow[] = [];
  const closedTabs: string[] = [];
  const saved: [string, Rectangle][] = [];
  const focused: string[] = [];
  const resized: string[] = [];

  const windows = createOwnWindows({
    windows: {
      create: (options) => {
        const fake: FakeWindow = {
          options,
          calls: [],
          bounds: options.bounds,
          minimized: false,
          destroyed: false,
          resize: noop,
          move: noop,
          focus: noop,
          blur: noop,
          endSession: noop,
          close: () => false,
        };
        const window: OwnWindow = {
          host: { hostId: created.length + 2 },
          show: () => fake.calls.push("show"),
          showInactive: () => fake.calls.push("showInactive"),
          focus: () => fake.calls.push("focus"),
          hide: () => fake.calls.push("hide"),
          isFocused: () => false,
          showContextMenu: () => fake.calls.push("menu"),
          isVisible: () => true,
          isMinimized: () => fake.minimized,
          minimize: () => fake.calls.push("minimize"),
          restore: () => fake.calls.push("restore"),
          setTitle: (title) => fake.calls.push(`title ${title}`),
          setBackgroundColor: (next) => fake.calls.push(`color ${next}`),
          getBounds: () => fake.bounds,
          getContentAreaSize: () => ({
            width: fake.bounds.width,
            height: fake.bounds.height,
          }),
          onContentAreaResize: (listener) => {
            fake.resize = listener;
          },
          onBoundsChange: (listener) => {
            fake.move = listener;
          },
          onClose: (listener) => {
            fake.close = () => {
              let kept = false;

              listener({
                preventDefault: () => {
                  kept = true;
                },
              });

              return kept;
            };
          },
          onFocus: (listener) => {
            fake.focus = listener;
          },
          onBlur: (listener) => {
            fake.blur = listener;
          },
          onClosed: noop,
          onHide: noop,
          onSessionEnd: (listener) => {
            fake.endSession = listener;
          },
          destroy: () => {
            fake.destroyed = true;
          },
          isDestroyed: () => fake.destroyed,
        };

        created.push(fake);

        return window;
      },
    },
    displays: {
      getAll: () => [
        { workArea: { x: 0, y: 0, width: 1920, height: 1080 }, primary: true },
      ],
    },
    apps: APPS,
    state: () => state,
    isMacOS: true,
    background,
    backgroundColor: () => color,
    closeTab: (key) => {
      closedTabs.push(tabKey(key));

      return Promise.resolve();
    },
    saveBounds: (key, bounds) => {
      saved.push([tabKey(key), bounds]);

      if (!holdSaves) {
        return Promise.resolve();
      }

      const { promise, resolve } = Promise.withResolvers<undefined>();

      heldSaves.push(() => resolve(undefined));

      return promise;
    },
    onFocus: (key) => focused.push(tabKey(key)),
    log: noop,
  });

  windows.onResize((key) => resized.push(tabKey(key)));

  return {
    windows,
    created,
    closedTabs,
    saved,
    focused,
    resized,
    finishSaves: () => {
      for (const finish of heldSaves) {
        finish();
      }
    },
    /** The tab gone from its own window, as closing it leaves it. */
    closeInState: () => {
      state = stateWith(false);
    },
    setColor: (next: string) => {
      color = next;
    },
  };
};

interface FakeTitlebar {
  view: OverlayView;
  calls: string[];
  gone: () => void;
}

const titlebar = (): FakeTitlebar => {
  const calls: string[] = [];
  const fake: FakeTitlebar = {
    calls,
    gone: noop,
    view: {
      webContentsId: 9,
      setBounds: ({ x, y, width, height }) =>
        calls.push(`bounds ${x},${y} ${width}x${height}`),
      show: () => calls.push("show"),
      hide: () => calls.push("hide"),
      moveUnder: ({ hostId }) => calls.push(`under ${hostId}`),
      moveOver: ({ hostId }) => calls.push(`over ${hostId}`),
      focus: () => calls.push("focus"),
      onFocus: noop,
      onKey: noop,
      onGone: (listener) => {
        fake.gone = listener;
      },
      close: () => calls.push("close"),
    },
  };

  return fake;
};

describe(createOwnWindows, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a tab's window once, where it last was, titled after its page and shown without focus, in the foreground too", () => {
    const { windows, created } = setup({ background: false });
    const first = windows.open(CALENDAR);
    const again = windows.open(CALENDAR);
    const [window] = created;

    expect([
      created.length,
      first.host,
      again.host,
      window?.options,
      window?.calls,
      first.pageBounds(),
    ]).toStrictEqual([
      1,
      { hostId: 2 },
      { hostId: 2 },
      {
        title: "Week",
        bounds: SAVED,
        minimumSize: { width: 480, height: 320 },
        titleBarStyle: "hiddenInset",
        backgroundColor: "#eeeeee",
      },
      ["showInactive"],
      { x: 8, y: 40, width: 884, height: 552 },
    ]);
  });

  it("shows and focuses a window it reveals, restoring it when minimized, and only shows it in the background", () => {
    const foreground = setup({ background: false });
    const quiet = setup();

    foreground.windows.open(CALENDAR);
    quiet.windows.open(CALENDAR);

    const [window] = foreground.created;

    if (window) {
      window.minimized = true;
    }

    foreground.windows.reveal(CALENDAR);
    quiet.windows.reveal(CALENDAR);

    expect([window?.calls, quiet.created[0]?.calls]).toStrictEqual([
      ["showInactive", "restore", "show", "focus"],
      ["showInactive", "showInactive"],
    ]);
  });

  it("keeps a window open when closed by its control, closes its tab, and closes the window once the tab is gone", async () => {
    const { windows, created, closedTabs, closeInState } = setup();

    windows.open(CALENDAR);
    const [window] = created;
    const kept = window?.close();

    closeInState();
    windows.close(CALENDAR);
    await vi.advanceTimersByTimeAsync(0);

    expect([
      kept,
      closedTabs,
      window?.destroyed,
      windows.isOpen(CALENDAR),
    ]).toStrictEqual([true, ["p/c1"], true, false]);
  });

  it("closes a window whose tab closing left it open, once the tab has closed", async () => {
    const { windows, created, closeInState } = setup();

    windows.open(CALENDAR);
    closeInState();
    const [window] = created;
    const kept = window?.close();

    await vi.advanceTimersByTimeAsync(0);

    expect([kept, window?.destroyed, windows.isOpen(CALENDAR)]).toStrictEqual([
      true,
      true,
      false,
    ]);
  });

  it("treats the session ending as a quit: every window closes with its tab kept", () => {
    const { windows, created, closedTabs } = setup();

    windows.open(CALENDAR);
    const [window] = created;

    window?.endSession();

    expect([window?.close(), closedTabs]).toStrictEqual([false, []]);
  });

  it("settles a quit's wait once each save of where a window is has", async () => {
    const steps: string[] = [];
    const { windows, created, finishSaves } = setup({ holdSaves: true });

    windows.open(CALENDAR);
    created[0]?.move();
    windows.markQuitting();

    const waiting = (async () => {
      await windows.saved();
      steps.push("settled");
    })();

    await vi.advanceTimersByTimeAsync(0);
    steps.push("checked");
    finishSaves();
    await waiting;

    expect(steps).toStrictEqual(["checked", "settled"]);
  });

  it("while quitting lets each window close with its tab kept where it is, and saves where it was", () => {
    const { windows, created, closedTabs, saved } = setup();

    windows.open(CALENDAR);
    const [window] = created;

    if (window) {
      window.bounds = { x: 5, y: 6, width: 700, height: 500 };
      window.move();
    }

    windows.markQuitting();

    expect([window?.close(), closedTabs, saved]).toStrictEqual([
      false,
      [],
      [["p/c1", { x: 5, y: 6, width: 700, height: 500 }]],
    ]);
  });

  it("saves where a window is once it rests after moving, and tells of its resizing and focus", () => {
    const { windows, created, saved, focused, resized } = setup();

    windows.open(CALENDAR);
    const [window] = created;

    window?.move();
    window?.move();
    vi.advanceTimersByTime(499);
    const early = saved.length;

    vi.advanceTimersByTime(1);
    window?.resize();
    window?.focus();

    expect([early, saved, resized, focused]).toStrictEqual([
      0,
      [["p/c1", SAVED]],
      ["p/c1"],
      ["p/c1"],
    ]);
  });

  it("puts the shell's titlebar under the page over the whole window, follows its size, and takes a new one after the shell reloads", () => {
    const { windows, created } = setup();

    windows.open(CALENDAR);
    const [window] = created;
    const first = titlebar();
    const second = titlebar();

    windows.adoptTitlebar(CALENDAR, first.view);
    window?.resize();
    first.gone();
    windows.adoptTitlebar(CALENDAR, second.view);
    windows.close(CALENDAR);

    expect([first.calls, second.calls]).toStrictEqual([
      ["under 2", "bounds 0,0 900x600", "bounds 0,0 900x600"],
      ["under 2", "bounds 0,0 900x600", "close"],
    ]);
  });

  it("puts the shell's find bar over the page at its top right, follows the window's width, offers what focuses it, and closes it with the window", () => {
    const { windows, created } = setup();

    windows.open(CALENDAR);
    const [window] = created;
    const bar = titlebar();
    const stray = titlebar();

    windows.adoptFind(CALENDAR, bar.view);
    windows.findFocuser(CALENDAR)?.();

    if (window) {
      window.bounds = { ...window.bounds, width: 1000 };
      window.resize();
    }

    windows.close(CALENDAR);
    windows.adoptFind(CALENDAR, stray.view);

    expect([
      bar.calls,
      stray.calls,
      windows.findFocuser(CALENDAR),
    ]).toStrictEqual([
      [
        "over 2",
        "bounds 531,48 353x40",
        "focus",
        "bounds 631,48 353x40",
        "close",
      ],
      ["close"],
      undefined,
    ]);
  });

  it("puts the shell's Downloads card over the whole page, follows the window's size, offers what focuses it and its web contents, and closes it with the window, telling of that and of the window losing the keys", () => {
    const { windows, created } = setup();
    const blurred: string[] = [];
    const closed: string[] = [];

    windows.onBlur((key) => blurred.push(tabKey(key)));
    windows.onClosed((key) => closed.push(tabKey(key)));
    windows.open(CALENDAR);
    const [window] = created;
    const card = titlebar();

    windows.adoptCard(CALENDAR, card.view);
    windows.cardFocuser(CALENDAR)?.();
    const contents = windows.cardContentsId(CALENDAR);

    if (window) {
      window.bounds = { ...window.bounds, width: 1000 };
      window.resize();
      window.blur();
    }

    windows.close(CALENDAR);

    expect([
      card.calls,
      contents,
      windows.cardContentsId(CALENDAR),
      blurred,
      closed,
    ]).toStrictEqual([
      [
        "over 2",
        "bounds 8,40 884x552",
        "focus",
        "bounds 8,40 984x552",
        "close",
      ],
      9,
      undefined,
      ["p/c1"],
      ["p/c1"],
    ]);
  });

  it("closes a titlebar for a window that is not open, and one replaced before it went", () => {
    const { windows } = setup();
    const stray = titlebar();
    const first = titlebar();
    const second = titlebar();

    windows.adoptTitlebar(CALENDAR, stray.view);
    windows.open(CALENDAR);
    windows.adoptTitlebar(CALENDAR, first.view);
    windows.adoptTitlebar(CALENDAR, second.view);

    expect([stray.calls, first.calls.at(-1)]).toStrictEqual([
      ["close"],
      "close",
    ]);
  });

  it("titles and paints each window again when asked", () => {
    const { windows, created, setColor } = setup();

    windows.open(CALENDAR);
    setColor("#222222");
    windows.retitle();
    windows.recolor();

    expect(created[0]?.calls).toStrictEqual([
      "showInactive",
      "title Week",
      "color #222222",
    ]);
  });
});
