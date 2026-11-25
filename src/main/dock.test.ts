import { describe, expect, it } from "vitest";

import { canHideDock, dockShown } from "#core/dock.ts";
import type { Settings } from "#core/settings.ts";
import type { Dock } from "#platform/dock.ts";

import { assertDockChange, createDockIcon } from "./dock.ts";
import { createSettingsStore } from "./settings.ts";

const setup = (initial?: Settings) => {
  const calls: string[] = [];
  const saved: Settings[] = [];
  const dock: Dock = {
    show: () => {
      calls.push("show");
    },
    hide: () => {
      calls.push("hide");
    },
  };
  const settings = createSettingsStore({
    initial: initial ?? { version: 1 },
    save: (next) => {
      saved.push(structuredClone(next));

      return Promise.resolve();
    },
    platform: "darwin",
    log: () => false,
  });
  const icon = createDockIcon({
    dock,
    settings,
    onShown: () => {
      calls.push("redraw");
    },
    log: () => false,
  });

  return { calls, saved, settings, icon };
};

describe(dockShown, () => {
  it("shows the icon as set while the menu bar icon shows, and always while it does not", () => {
    expect([
      dockShown({ dockIcon: true, tray: true }),
      dockShown({ dockIcon: false, tray: true }),
      dockShown({ dockIcon: true, tray: false }),
      dockShown({ dockIcon: false, tray: false }),
    ]).toStrictEqual([true, false, true, true]);
  });

  it("lets the icon be turned off only while the menu bar icon shows", () => {
    expect([
      canHideDock({ tray: true }),
      canHideDock({ tray: false }),
    ]).toStrictEqual([true, false]);
  });
});

describe(createDockIcon, () => {
  it("leaves the Dock alone at launch while the icon is to show", () => {
    const { calls, icon } = setup();

    expect([calls, icon.isShown()]).toStrictEqual([[], true]);
  });

  it("hides the icon at launch when the file says so and the menu bar icon shows", () => {
    const { calls, icon } = setup({ version: 1, tray: true, dockIcon: false });

    expect([calls, icon.isShown()]).toStrictEqual([["hide"], false]);
  });

  it("shows the icon for a file with both off, and leaves the file as found", async () => {
    const { calls, saved, icon, settings } = setup({
      version: 1,
      tray: false,
      dockIcon: false,
    });

    await Promise.resolve();

    expect([
      calls,
      icon.isShown(),
      saved,
      settings.get("dockIcon"),
    ]).toStrictEqual([[], true, [], false]);
  });

  it("hides and shows the icon at once as the setting changes, drawing the badge again once it is back", async () => {
    const { calls, settings } = setup({ version: 1, tray: true });

    await settings.update("dockIcon", () => false);
    await settings.update("dockIcon", () => true);

    expect(calls).toStrictEqual(["hide", "show", "redraw"]);
  });

  it("turning the menu bar icon off shows the Dock icon and turns its setting back on", async () => {
    const { calls, saved, settings } = setup({
      version: 1,
      tray: true,
      dockIcon: false,
    });

    await settings.update("tray", () => false);
    // Queued behind the write the tray's listener asked for.
    await settings.update("dockIcon", (value) => value);

    expect([calls, saved.at(-1), settings.get("dockIcon")]).toStrictEqual([
      ["hide", "show", "redraw"],
      { version: 1, tray: false, dockIcon: true },
      true,
    ]);
  });

  it("refuses to turn the icon off while the menu bar icon is off", async () => {
    const { settings } = setup();

    expect(() => {
      assertDockChange(settings, false);
    }).toThrow("The Dock icon cannot hide while the menu bar icon is off");
    expect(() => {
      assertDockChange(settings, true);
    }).not.toThrow();

    await settings.update("tray", () => true);

    expect(() => {
      assertDockChange(settings, false);
    }).not.toThrow();
  });
});
