import { describe, expect, it } from "vitest";

import type {
  AppWindow,
  WindowLoadEvent,
  WindowOptions,
} from "#platform/window.ts";

import { createShellWindow, revealWindow } from "./shell-window.ts";

const createFakeWindow = () => {
  const listeners = new Map<WindowLoadEvent, () => void>();
  const calls: string[] = [];
  let minimized = false;

  const window: AppWindow = {
    loadURL: () => Promise.resolve(),
    once: (event, listener) => {
      listeners.set(event, listener);
    },
    show: () => {
      calls.push("show");
    },
    showInactive: () => {
      calls.push("showInactive");
    },
    focus: () => {
      calls.push("focus");
    },
    restore: () => {
      minimized = false;
      calls.push("restore");
    },
    isMinimized: () => minimized,
    isDestroyed: () => false,
    getContentSize: () => ({ width: 1280, height: 800 }),
    onResize: () => false,
    addContentView: () => ({
      setBounds: () => false,
      loadURL: () => Promise.resolve(),
    }),
  };

  return {
    window,
    calls,
    emit: (event: WindowLoadEvent) => listeners.get(event)?.(),
    minimize: () => {
      minimized = true;
    },
  };
};

const open = ({ background = false, isMacOS = true } = {}) => {
  const fake = createFakeWindow();
  const created: WindowOptions[] = [];

  createShellWindow({
    windows: {
      create: (options) => {
        created.push(options);

        return fake.window;
      },
    },
    displays: {
      getAll: () => [
        { workArea: { x: 0, y: 0, width: 1920, height: 1080 }, primary: true },
      ],
    },
    title: "Meru",
    url: "meru-app://shell/index.html",
    preloadPath: "/app/preload-shell.cjs",
    isMacOS,
    background,
  });

  return { ...fake, options: created[0] };
};

describe(createShellWindow, () => {
  it("shows the window once, on whichever load event fires first", () => {
    const shell = open();

    shell.emit("did-finish-load");
    shell.emit("ready-to-show");

    expect(shell.calls).toStrictEqual(["show"]);
  });

  it("shows the window without activating it in the background", () => {
    const shell = open({ background: true });

    shell.emit("ready-to-show");

    expect(shell.calls).toStrictEqual(["showInactive"]);
  });

  it("opens centred on the primary display at the default size", () => {
    expect(open().options?.bounds).toStrictEqual({
      x: 320,
      y: 140,
      width: 1280,
      height: 800,
    });
  });

  it("insets the titlebar on macOS only", () => {
    expect(open({ isMacOS: true }).options?.titleBarStyle).toBe("hiddenInset");
    expect(open({ isMacOS: false }).options?.titleBarStyle).toBe("default");
  });
});

describe(revealWindow, () => {
  it("restores and focuses the window", () => {
    const fake = createFakeWindow();

    fake.minimize();
    revealWindow(fake.window, false);

    expect(fake.calls).toStrictEqual(["restore", "show", "focus"]);
  });

  it("never focuses the window in the background", () => {
    const fake = createFakeWindow();

    revealWindow(fake.window, true);

    expect(fake.calls).toStrictEqual(["showInactive"]);
  });
});
