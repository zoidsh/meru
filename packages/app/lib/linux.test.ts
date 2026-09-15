import { describe, expect, mock, test } from "bun:test";
import type { LinuxWindowControlsSignals } from "./linux";

// The module's platform check, store and logger all reach for an Electron app
// that does not exist here, and they do it at import time.
mock.module("@electron-toolkit/utils", () => ({
  platform: { isLinux: true },
}));

mock.module("@/config", () => ({
  config: { get: () => "auto" },
}));

mock.module("./log", () => ({
  log: { debug: () => {} },
}));

const { resolveLinuxWindowControls } = await import("./linux");

function signals(overrides: Partial<LinuxWindowControlsSignals> = {}) {
  return {
    windowManagerName: null,
    desktops: [],
    desktopSession: null,
    hasSwaySocket: false,
    hasHyprlandSignature: false,
    hasI3Socket: false,
    gtkDecorationLayout: null,
    ...overrides,
  };
}

describe("resolveLinuxWindowControls", () => {
  test("hides the controls under a tiling window manager", () => {
    expect(resolveLinuxWindowControls(signals({ windowManagerName: "dwm" }), "auto")).toBe(false);
  });

  test("does not read a tiling name out of the middle of a longer one", () => {
    expect(
      resolveLinuxWindowControls(
        signals({ windowManagerName: "i3lock-manager", gtkDecorationLayout: "appmenu:close" }),
        "auto",
      ),
    ).toBe(true);
  });

  test("lets a known stacking window manager beat a stale compositor variable", () => {
    expect(
      resolveLinuxWindowControls(
        signals({
          windowManagerName: "KWin",
          hasSwaySocket: true,
          gtkDecorationLayout: "appmenu:close",
        }),
        "auto",
      ),
    ).toBe(true);
  });

  test("hides the controls when only a compositor's socket identifies the session", () => {
    expect(resolveLinuxWindowControls(signals({ hasSwaySocket: true }), "auto")).toBe(false);
  });

  test("hides the controls when only the desktop names the compositor", () => {
    expect(resolveLinuxWindowControls(signals({ desktops: ["Hyprland"] }), "auto")).toBe(false);
  });

  test("follows the decoration layout under a stacking window manager", () => {
    expect(
      resolveLinuxWindowControls(
        signals({ windowManagerName: "GNOME Shell", gtkDecorationLayout: "appmenu:close" }),
        "auto",
      ),
    ).toBe(true);

    expect(
      resolveLinuxWindowControls(
        signals({ windowManagerName: "GNOME Shell", gtkDecorationLayout: "appmenu:" }),
        "auto",
      ),
    ).toBe(false);
  });

  test("shows the controls when nothing identifies the window manager", () => {
    expect(resolveLinuxWindowControls(signals({ windowManagerName: "Frobnicator" }), "auto")).toBe(
      true,
    );

    expect(
      resolveLinuxWindowControls(
        signals({
          windowManagerName: "Frobnicator",
          gtkDecorationLayout: "appmenu:minimize,close",
        }),
        "auto",
      ),
    ).toBe(true);
  });

  test("lets the setting override the detection", () => {
    expect(resolveLinuxWindowControls(signals({ windowManagerName: "dwm" }), "show")).toBe(true);

    expect(
      resolveLinuxWindowControls(
        signals({ windowManagerName: "GNOME Shell", gtkDecorationLayout: "appmenu:close" }),
        "hide",
      ),
    ).toBe(false);
  });
});
