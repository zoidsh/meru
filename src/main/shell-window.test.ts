import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { OVERLAY_FRAME_NAME } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import { SHELL_GREY } from "#core/shell-grey.ts";
import type {
  AppWindow,
  WindowLoadEvent,
  WindowOptions,
} from "#platform/window.ts";

import {
  createShellWindow,
  hideOnClose,
  revealWindow,
} from "./shell-window.ts";

const createFakeWindow = () => {
  const listeners = new Map<WindowLoadEvent, () => void>();
  const calls: string[] = [];
  let minimized = false;
  let fullScreen = false;
  let leftFullScreen: (() => void) | undefined;
  let closeListener:
    | ((event: { preventDefault: () => void }) => void)
    | undefined;
  let sessionEnd: (() => void) | undefined;

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
    isFocused: () => false,
    isVisible: () => false,
    on: () => false,
    focusPage: () => false,
    onPageFocus: () => false,
    onOverlayDocument: () => false,
    onPageGone: () => false,
    restore: () => {
      minimized = false;
      calls.push("restore");
    },
    isMinimized: () => minimized,
    isDestroyed: () => false,
    hide: () => {
      calls.push("hide");
    },
    onClose: (listener) => {
      closeListener = listener;
    },
    isFullScreen: () => fullScreen,
    leaveFullScreen: (then) => {
      calls.push("leaveFullScreen");
      leftFullScreen = then;
    },
    onSessionEnd: (listener) => {
      sessionEnd = listener;
    },
    setOverlayIcon: () => false,
    setBackgroundColor: (color) => {
      calls.push(`setBackgroundColor ${color}`);
    },
    getContentAreaSize: () => ({ width: 1280, height: 800 }),
    onContentAreaResize: () => false,
    addContentView: () => ({
      setBounds: () => false,
      setBorderRadius: () => false,
      loadURL: () => Promise.resolve(),
      reload: () => false,
      goBack: () => false,
      goForward: () => false,
      stop: () => false,
      navigation: () => ({
        canGoBack: false,
        canGoForward: false,
        loading: false,
      }),
      url: () => "",
      evaluate: () => Promise.resolve(),
      setVisible: () => false,
      close: () => false,
      focus: () => false,
      findInPage: () => 0,
      stopFindInPage: () => false,
      zoom: () => false,
    }),
    webContentsId: 1,
    showContextMenu: () => false,
    confirm: () => Promise.resolve(false),
  };

  return {
    window,
    calls,
    emit: (event: WindowLoadEvent) => listeners.get(event)?.(),
    minimize: () => {
      minimized = true;
    },
    enterFullScreen: () => {
      fullScreen = true;
    },
    finishLeavingFullScreen: () => {
      fullScreen = false;
      leftFullScreen?.();
    },
    /** Asks the window to close; whether it stays open. */
    close: () => {
      let prevented = false;

      closeListener?.({
        preventDefault: () => {
          prevented = true;
        },
      });

      return prevented;
    },
    endSession: () => sessionEnd?.(),
  };
};

const open = ({ background = false, isMacOS = true } = {}) => {
  const fake = createFakeWindow();
  const created: WindowOptions[] = [];
  let isDark = false;
  let themeChanged: (() => void) | undefined;

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
    theme: {
      isDark: () => isDark,
      onChange: (listener) => {
        themeChanged = listener;
      },
    },
  });

  return {
    ...fake,
    options: created[0],
    turnDark: () => {
      isDark = true;
      themeChanged?.();
    },
  };
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

  it("opens in the light shell grey and takes the dark one with the theme", () => {
    const shell = open();

    expect(shell.options?.backgroundColor).toBe("#ebebeb");

    shell.turnDark();

    expect(shell.calls).toStrictEqual(["setBackgroundColor #1d1d1d"]);
  });

  it("takes the shell grey the shell paints, light and dark", async () => {
    const css = await readFile(
      path.join(import.meta.dirname, "..", "ui", "styles.css"),
      "utf-8"
    );
    const tokens = [...css.matchAll(/--shell: (?<value>[^;]+);/gu)].map(
      (match) => match.groups?.value
    );

    expect(tokens).toStrictEqual([SHELL_GREY.light, SHELL_GREY.dark]);
  });

  it("insets the titlebar on macOS only", () => {
    expect(open({ isMacOS: true }).options?.titleBarStyle).toBe("hiddenInset");
    expect(open({ isMacOS: false }).options?.titleBarStyle).toBe("default");
  });

  it("lets the page open the overlay's blank document and nothing else", () => {
    const allowed = open().options?.isOverlayDocument;

    expect(
      allowed?.({ url: "about:blank", frameName: OVERLAY_FRAME_NAME })
    ).toBeTruthy();
    expect(
      allowed?.({ url: "https://example.com/", frameName: OVERLAY_FRAME_NAME })
    ).toBeFalsy();
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

const follow = (platform: Platform, trayShown: () => boolean) => {
  const fake = createFakeWindow();
  const closing = hideOnClose({ window: fake.window, platform, trayShown });

  return { ...fake, ...closing };
};

describe(hideOnClose, () => {
  it("hides the window on macOS, tray or not", () => {
    const shell = follow("darwin", () => false);

    expect(shell.close()).toBeTruthy();
    expect(shell.calls).toStrictEqual(["hide"]);
  });

  it("hides on Windows and Linux only while the tray shows, read at each close", () => {
    for (const platform of ["win32", "linux"] as const) {
      let trayShown = true;
      const shell = follow(platform, () => trayShown);

      expect(shell.close()).toBeTruthy();

      trayShown = false;

      expect(shell.close()).toBeFalsy();
      expect(shell.calls).toStrictEqual(["hide"]);
    }
  });

  it("lets the window close once Meru quits", () => {
    const shell = follow("darwin", () => true);

    shell.markQuitting();

    expect(shell.close()).toBeFalsy();
    expect(shell.calls).toStrictEqual([]);
  });

  it("lets a shutdown or sign-out close it", () => {
    const shell = follow("win32", () => true);

    shell.endSession();

    expect(shell.close()).toBeFalsy();
  });

  it("leaves full screen on macOS before it hides", () => {
    const shell = follow("darwin", () => false);

    shell.enterFullScreen();

    expect(shell.close()).toBeTruthy();
    expect(shell.calls).toStrictEqual(["leaveFullScreen"]);

    shell.finishLeavingFullScreen();

    expect(shell.calls).toStrictEqual(["leaveFullScreen", "hide"]);
  });
});
