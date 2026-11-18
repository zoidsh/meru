import { noop } from "es-toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APPS } from "#core/apps.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { tabKey } from "#core/tabs.ts";
import type { Rectangle } from "#core/window-bounds.ts";
import type { OverlayView } from "#platform/overlay-view.ts";
import type { OwnWindow, OwnWindowOptions } from "#platform/own-window.ts";

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
  options: OwnWindowOptions;
  calls: string[];
  bounds: Rectangle;
  minimized: boolean;
  destroyed: boolean;
  resize: () => void;
  move: () => void;
  focus: () => void;
  /** Asks it to close by its control; says whether it was kept open. */
  close: () => boolean;
}

const setup = ({ background = true } = {}) => {
  let state = stateWith(true);
  let color = "#eeeeee";
  const created: FakeWindow[] = [];
  const movedBack: string[] = [];
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
          close: () => false,
        };
        const window: OwnWindow = {
          host: { hostId: created.length + 2 },
          show: () => fake.calls.push("show"),
          showInactive: () => fake.calls.push("showInactive"),
          focus: () => fake.calls.push("focus"),
          isFocused: () => false,
          isMinimized: () => fake.minimized,
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
    moveToMainWindow: (key) => {
      movedBack.push(tabKey(key));

      return Promise.resolve();
    },
    saveBounds: (key, bounds) => {
      saved.push([tabKey(key), bounds]);

      return Promise.resolve();
    },
    onFocus: (key) => focused.push(tabKey(key)),
    log: noop,
  });

  windows.onResize((key) => resized.push(tabKey(key)));

  return {
    windows,
    created,
    movedBack,
    saved,
    focused,
    resized,
    /** The tab back in the main window, as moving it back leaves it. */
    moveBackInState: () => {
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
      setBounds: ({ width, height }) => calls.push(`bounds ${width}x${height}`),
      show: () => calls.push("show"),
      hide: () => calls.push("hide"),
      moveUnder: ({ hostId }) => calls.push(`under ${hostId}`),
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

  it("opens a tab's window once, where it last was, titled after its page and shown without focus in the background", () => {
    const { windows, created } = setup();
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
      ["show", "restore", "show", "focus"],
      ["showInactive", "showInactive"],
    ]);
  });

  it("keeps a window open when closed by its control, puts its tab back, and closes it once the tab is back", () => {
    const { windows, created, movedBack, moveBackInState } = setup();

    windows.open(CALENDAR);
    const [window] = created;
    const kept = window?.close();

    moveBackInState();
    windows.close(CALENDAR);

    expect([
      kept,
      movedBack,
      window?.destroyed,
      windows.isOpen(CALENDAR),
    ]).toStrictEqual([true, ["p/c1"], true, false]);
  });

  it("closes at once a window whose tab has left it", () => {
    const { windows, created, movedBack, moveBackInState } = setup();

    windows.open(CALENDAR);
    moveBackInState();
    const [window] = created;

    expect([window?.close(), window?.destroyed, movedBack]).toStrictEqual([
      true,
      true,
      [],
    ]);
  });

  it("while quitting lets each window close with its tab kept where it is, and saves where it was", () => {
    const { windows, created, movedBack, saved } = setup();

    windows.open(CALENDAR);
    const [window] = created;

    if (window) {
      window.bounds = { x: 5, y: 6, width: 700, height: 500 };
      window.move();
    }

    windows.markQuitting();

    expect([window?.close(), movedBack, saved]).toStrictEqual([
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
      ["under 2", "bounds 900x600", "bounds 900x600"],
      ["under 2", "bounds 900x600", "close"],
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
