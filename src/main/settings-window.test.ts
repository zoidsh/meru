import { describe, expect, it } from "vitest";

import { silentLog } from "#core/log.fake.ts";
import type { WindowFocusEvent, WindowLoadEvent } from "#platform/window.ts";

import { createSettingsWindow } from "./settings-window.ts";
import type { SettingsWindowHandle } from "./settings-window.ts";

const setup = (background = false) => {
  const calls: string[] = [];
  const windows: {
    close: () => void;
    load: () => void;
    emit: (event: WindowFocusEvent) => void;
  }[] = [];
  let nextId = 10;

  const settings = createSettingsWindow({
    create: () => {
      const id = nextId;
      const loadListeners: (() => void)[] = [];
      const focusListeners: [WindowFocusEvent, () => void][] = [];
      let closed: (() => void) | undefined;
      let destroyed = false;

      nextId += 1;
      calls.push(`create ${id}`);

      const window: SettingsWindowHandle = {
        webContentsId: id,
        loadURL: (url) => {
          calls.push(`load ${id} ${url}`);

          return Promise.resolve();
        },
        once: (_event: WindowLoadEvent, listener) => {
          loadListeners.push(listener);
        },
        show: () => calls.push(`show ${id}`),
        showInactive: () => calls.push(`showInactive ${id}`),
        focus: () => calls.push(`focus ${id}`),
        isDestroyed: () => destroyed,
        isMinimized: () => false,
        restore: () => false,
        onClosed: (listener) => {
          closed = listener;
        },
        on: (event, listener) => {
          focusListeners.push([event, listener]);
        },
      };

      windows.push({
        close: () => {
          destroyed = true;
          closed?.();
        },
        load: () => {
          for (const listener of loadListeners) {
            listener();
          }
        },
        emit: (event) => {
          for (const [each, listener] of focusListeners) {
            if (each === event) {
              listener();
            }
          }
        },
      });

      return window;
    },
    url: () => "meru-app://settings/index.html",
    background,
    register: (id) => {
      calls.push(`register ${id}`);

      return () => calls.push(`drop ${id}`);
    },
    prepare: () => false,
    log: silentLog,
  });

  return { settings, calls, windows };
};

describe(createSettingsWindow, () => {
  it("opens one window, shown once it can paint, and brings it forward when opened again", () => {
    const { settings, calls, windows } = setup();

    settings.open();
    windows[0]?.load();
    settings.open();

    expect(calls).toStrictEqual([
      "create 10",
      "register 10",
      "load 10 meru-app://settings/index.html",
      "show 10",
      "focus 10",
      "show 10",
      "focus 10",
    ]);
  });

  it("opens a new window once the last has closed", () => {
    const { settings, calls, windows } = setup();

    settings.open();
    windows[0]?.close();
    settings.open();

    expect([calls, settings.current()?.webContentsId]).toStrictEqual([
      [
        "create 10",
        "register 10",
        "load 10 meru-app://settings/index.html",
        "drop 10",
        "create 11",
        "register 11",
        "load 11 meru-app://settings/index.html",
      ],
      11,
    ]);
  });

  it("tells whether it is the window keys go to, and of each change, until it closes", () => {
    const { settings, windows } = setup();
    const seen: boolean[] = [];

    settings.onFocusChange(() => seen.push(settings.isFocused()));
    settings.open();
    windows[0]?.emit("focus");
    windows[0]?.emit("focus");
    windows[0]?.emit("blur");
    windows[0]?.emit("focus");
    windows[0]?.close();

    expect([seen, settings.isFocused()]).toStrictEqual([
      [true, false, true, false],
      false,
    ]);
  });

  it("in the background shows it without focus", () => {
    const { settings, calls, windows } = setup(true);

    settings.open();
    windows[0]?.load();
    settings.open();

    expect(calls.slice(3)).toStrictEqual([
      "showInactive 10",
      "showInactive 10",
    ]);
  });
});
