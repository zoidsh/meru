import { describe, expect, it } from "vitest";

import { stageArea, TITLEBAR_HEIGHT, titleBarOf } from "./chrome.ts";

describe(titleBarOf, () => {
  it("centres the traffic lights on the titlebar row on macOS", () => {
    expect(
      titleBarOf({ linuxControls: false, platform: "darwin", theme: "dark" })
    ).toStrictEqual({
      overlay: { color: "#0a0a0a", height: 39, symbolColor: "#fafafa" },
      style: "hiddenInset",
      trafficLights: { x: 12, y: 14 },
    });
  });

  it("overlays the window controls in the chrome's colours on Windows", () => {
    expect(
      titleBarOf({ linuxControls: false, platform: "win32", theme: "light" })
    ).toStrictEqual({
      overlay: {
        color: "#ffffff",
        height: TITLEBAR_HEIGHT - 1,
        symbolColor: "#0a0a0a",
      },
      style: "hidden",
      trafficLights: null,
    });
    expect(
      titleBarOf({ linuxControls: false, platform: "win32", theme: "dark" })
        .overlay?.color
    ).toBe("#0a0a0a");
  });

  it("overlays them on Linux only when the user turned them on", () => {
    expect(
      titleBarOf({ linuxControls: false, platform: "linux", theme: "light" })
        .overlay
    ).toBeNull();
    expect(
      titleBarOf({ linuxControls: true, platform: "linux", theme: "light" })
        .overlay
    ).not.toBeNull();
  });
});

describe(stageArea, () => {
  it("leaves the titlebar above and the sidebar to the left", () => {
    expect(
      stageArea({ height: 800, width: 1200, x: 0, y: 0 }, { left: 64, top: 40 })
    ).toStrictEqual({ height: 760, width: 1136, x: 64, y: 40 });
  });

  it("never gives a side less than nothing", () => {
    expect(
      stageArea({ height: 20, width: 30, x: 0, y: 0 }, { left: 64, top: 40 })
    ).toStrictEqual({ height: 0, width: 0, x: 30, y: 20 });
  });
});
