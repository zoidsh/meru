import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { LaunchWindow } from "#core/launch-window.ts";
import { OVERLAY_FRAME_NAME } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import { SHELL_GREY } from "#core/shell-grey.ts";
import type {
  AppWindow,
  WindowLoadEvent,
  WindowOptions,
} from "#platform/window.ts";

import { createShellWindow, hideOnClose } from "./shell-window.ts";
import { revealWindow } from "./windows.ts";

const createFakeWindow = () => {
  const listeners = new Map<WindowLoadEvent, () => void>();
  const calls: string[] = [];
  let minimized = false;
  let visible = false;
  let fullScreen = false;
  let leftFullScreen: (() => void) | undefined;
  let closeListener:
    | ((event: { preventDefault: () => void }) => void)
    | undefined;
  let sessionEnd: (() => void) | undefined;
  let closed: (() => void) | undefined;

  const window: AppWindow = {
    loadURL: () => Promise.resolve(),
    once: (event, listener) => {
      listeners.set(event, listener);
    },
    show: () => {
      visible = true;
      calls.push("show");
    },
    showInactive: () => {
      visible = true;
      calls.push("showInactive");
    },
    focus: () => {
      calls.push("focus");
    },
    isFocused: () => false,
    isVisible: () => visible,
    on: () => false,
    focusPage: () => false,
    onPageFocus: () => false,
    onShellDocument: () => false,
    filterShellDocuments: () => false,
    onPageGone: () => false,
    onRendererGone: () => false,
    reload: () => false,
    restore: () => {
      minimized = false;
      calls.push("restore");
    },
    isMinimized: () => minimized,
    minimize: () => {
      minimized = true;
      calls.push("minimize");
    },
    isDestroyed: () => false,
    hide: () => {
      visible = false;
      calls.push("hide");
    },
    onClose: (listener) => {
      closeListener = listener;
    },
    onClosed: (listener) => {
      closed = listener;
    },
    onFocus: () => false,
    onBlur: () => false,
    onHide: () => false,
    onBoundsChange: () => false,
    setTitle: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 1280, height: 800 }),
    destroy: () => false,
    isFullScreen: () => fullScreen,
    leaveFullScreen: (then) => {
      calls.push("leaveFullScreen");
      leftFullScreen = then;
    },
    onSessionEnd: (listener) => {
      sessionEnd = listener;
    },
    setOverlayIcon: () => false,
    setProgressBar: () => {},
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
      audible: () => false,
      evaluate: () => Promise.resolve(),
      setVisible: () => false,
      close: () => false,
      focus: () => false,
      findInPage: () => 0,
      stopFindInPage: () => false,
      zoom: () => false,
      moveTo: () => false,
    }),
    webContentsId: 1,
    host: { hostId: 1 },
    showContextMenu: () => false,
    confirm: () => Promise.resolve(false),
    pickFolder: () => Promise.resolve(undefined),
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

      if (!prevented) {
        closed?.();
      }

      return prevented;
    },
    endSession: () => sessionEnd?.(),
  };
};

const open = ({
  background = false,
  isMacOS = true,
  atLaunch = "shown" as LaunchWindow,
} = {}) => {
  const fake = createFakeWindow();
  const created: WindowOptions[] = [];
  let color = "#ebebeb";

  const { recolor } = createShellWindow({
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
    atLaunch,
    backgroundColor: () => color,
  });

  return {
    ...fake,
    options: created[0],
    paint: (next: string) => {
      color = next;
      recolor();
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

  it("leaves the window hidden in the background until something reveals it, and minimizes it where asked, never activating it", () => {
    const hidden = open({ atLaunch: "hidden" });
    const minimized = open({ atLaunch: "minimized" });

    hidden.emit("ready-to-show");
    minimized.emit("ready-to-show");
    minimized.emit("did-finish-load");

    const atLaunch = [[...hidden.calls], [...minimized.calls]];

    revealWindow(hidden.window, false);

    expect([atLaunch, hidden.calls]).toStrictEqual([
      [[], ["showInactive", "minimize"]],
      ["show", "focus"],
    ]);
  });

  it("leaves a window opened again before its first paint shown and focused, at a background launch hidden or minimized", () => {
    const hidden = open({ atLaunch: "hidden" });
    const minimized = open({ atLaunch: "minimized" });

    for (const shell of [hidden, minimized]) {
      revealWindow(shell.window, false);
      shell.emit("ready-to-show");
    }

    expect([hidden.calls, minimized.calls]).toStrictEqual([
      ["show", "focus"],
      ["show", "focus"],
    ]);
  });

  it("opens centred on the primary display at the default size", () => {
    expect(open().options?.bounds).toStrictEqual({
      x: 320,
      y: 140,
      width: 1280,
      height: 800,
    });
  });

  it("opens in the frame's colour and paints the window again only when that changes", () => {
    const shell = open();

    expect(shell.options?.backgroundColor).toBe("#ebebeb");

    shell.paint("#ebebeb");
    shell.paint("#d7e3ff");
    shell.paint("#d7e3ff");
    shell.paint("#222a3c");

    expect(shell.calls).toStrictEqual([
      "setBackgroundColor #d7e3ff",
      "setBackgroundColor #222a3c",
    ]);
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
    const allowed = open().options?.isShellDocument;

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
  let quits = 0;
  const closing = hideOnClose({
    window: fake.window,
    platform,
    trayShown,
    quit: () => {
      quits += 1;
    },
  });

  return { ...fake, ...closing, quits: () => quits };
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
    expect([shell.calls, shell.quits()]).toStrictEqual([[], 0]);
  });

  it("quits Meru on Windows and Linux when the window closes with no tray to bring it back, a tab's own window open or not", () => {
    for (const platform of ["win32", "linux"] as const) {
      const shell = follow(platform, () => false);

      shell.close();

      expect(shell.quits()).toBe(1);
    }
  });

  it("never quits Meru on macOS, where closing hides the window, nor where the tray shows", () => {
    const mac = follow("darwin", () => false);
    const tray = follow("linux", () => true);

    mac.close();
    tray.close();

    expect([mac.quits(), tray.quits()]).toStrictEqual([0, 0]);
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
