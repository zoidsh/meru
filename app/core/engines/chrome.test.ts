import { describe, expect, it } from "vitest";

import {
  chromeInsets,
  stageArea,
  TITLEBAR_HEIGHT,
  titleBarOf,
} from "./chrome.ts";

describe(titleBarOf, () => {
  it("centres the traffic lights on the titlebar row on macOS", () => {
    expect(
      titleBarOf({ linuxControls: false, platform: "darwin", theme: "dark" })
    ).toStrictEqual({
      overlay: { color: "#1d1d24", height: 40, symbolColor: "#e2e2ea" },
      style: "hiddenInset",
      trafficLights: { x: 12, y: 14 },
    });
  });

  it("overlays the window controls in the chrome's colours on Windows", () => {
    expect(
      titleBarOf({ linuxControls: false, platform: "win32", theme: "light" })
    ).toStrictEqual({
      overlay: {
        color: "#ececf1",
        height: TITLEBAR_HEIGHT,
        symbolColor: "#2a2a30",
      },
      style: "hidden",
      trafficLights: null,
    });
    expect(
      titleBarOf({ linuxControls: false, platform: "win32", theme: "dark" })
        .overlay?.color
    ).toBe("#1d1d24");
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

describe(chromeInsets, () => {
  it("takes the titlebar's row, and the sidebar's width only while it shows", () => {
    expect([
      chromeInsets({ kind: "hidden" }),
      chromeInsets({ kind: "shown", size: "wide", width: 224 }),
    ]).toStrictEqual([
      { left: 0, top: TITLEBAR_HEIGHT },
      { left: 224, top: TITLEBAR_HEIGHT },
    ]);
  });
});

describe(stageArea, () => {
  it("leaves the titlebar above and the sidebar to the left, the panes flush against both", () => {
    expect(
      stageArea({ height: 800, width: 1200, x: 0, y: 0 }, { left: 64, top: 40 })
    ).toStrictEqual({
      area: { height: 760, width: 1136, x: 64, y: 40 },
      flush: { left: true, top: true },
    });
  });

  it("keeps the inset on a side the chrome does not take", () => {
    expect(
      stageArea({ height: 800, width: 1200, x: 0, y: 0 }, { left: 0, top: 40 })
        .flush
    ).toStrictEqual({ left: false, top: true });
  });

  it("never gives a side less than nothing", () => {
    expect(
      stageArea({ height: 20, width: 30, x: 0, y: 0 }, { left: 64, top: 40 })
        .area
    ).toStrictEqual({ height: 0, width: 0, x: 30, y: 20 });
  });
});
