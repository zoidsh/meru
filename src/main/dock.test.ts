import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { silentLog } from "#core/log.fake.ts";
import type { Settings } from "#core/settings.ts";
import type { Dock } from "#platform/dock.ts";

import {
  DOCK_SHOW_SETTLES_MS,
  checkedDockChange,
  createDockIcon,
} from "./dock.ts";
import { createSettingsStore } from "./settings.ts";

/** A Dock whose `show` settles only when the test says. */
const fakeDock = (calls: string[]) => {
  const pending: (() => void)[] = [];
  const dock: Dock = {
    show: () => {
      calls.push("show");

      const { promise, resolve } = Promise.withResolvers<undefined>();

      pending.push(() => {
        calls.push("shown");
        resolve(undefined);
      });

      return promise;
    },
    hide: () => {
      calls.push("hide");
    },
  };

  return {
    dock,
    settle: async () => {
      for (const resolve of pending.splice(0)) {
        resolve();
      }

      await vi.advanceTimersByTimeAsync(0);
    },
  };
};

const setup = (initial?: Settings) => {
  const calls: string[] = [];
  const saved: Settings[] = [];
  const { dock, settle } = fakeDock(calls);
  const settings = createSettingsStore({
    initial: initial ?? { version: 1 },
    save: (next) => {
      saved.push(structuredClone(next));

      return Promise.resolve();
    },
    platform: "darwin",
    log: silentLog,
  });
  const icon = createDockIcon({
    dock,
    settings,
    onShown: () => {
      calls.push("redraw");
    },
    log: silentLog,
  });

  return { calls, saved, settings, icon, settle };
};

/** Waits for writes the Dock icon queued behind the one just made. */
const queued = async (settings: ReturnType<typeof setup>["settings"]) => {
  await settings.update("dockIcon", (value) => value);
};

describe(createDockIcon, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

    await vi.advanceTimersByTimeAsync(0);

    expect([
      calls,
      icon.isShown(),
      saved,
      settings.get("dockIcon"),
    ]).toStrictEqual([[], true, [], false]);
  });

  it("hides and shows the icon as the setting changes, drawing the badge only once the show has settled", async () => {
    const { calls, settings, settle } = setup({ version: 1, tray: true });

    await settings.update("dockIcon", () => false);
    await settings.update("dockIcon", () => true);

    expect(calls).toStrictEqual(["hide", "show"]);

    await settle();

    expect(calls).toStrictEqual(["hide", "show", "shown", "redraw"]);
  });

  it("turning the menu bar icon off shows the Dock icon and turns its setting back on", async () => {
    const { calls, saved, settings, settle } = setup({
      version: 1,
      tray: true,
      dockIcon: false,
    });

    await settings.update("tray", () => false);
    await queued(settings);
    await settle();

    expect([calls, saved.at(-1), settings.get("dockIcon")]).toStrictEqual([
      ["hide", "show", "shown", "redraw"],
      { version: 1, tray: false, dockIcon: true },
      true,
    ]);
  });

  it("turning the menu bar icon on from a file with both off turns the Dock icon's setting on, as its switch read, and never hides it", async () => {
    const { calls, saved, settings, icon } = setup({
      version: 1,
      tray: false,
      dockIcon: false,
    });

    await settings.update("tray", () => true);
    await queued(settings);
    await vi.advanceTimersByTimeAsync(DOCK_SHOW_SETTLES_MS);

    expect([calls, saved.at(-1), icon.isShown()]).toStrictEqual([
      [],
      { version: 1, tray: true, dockIcon: true },
      true,
    ]);
  });

  it("makes again a hide asked for within a second of a show, which Electron ignores, once the second has passed", async () => {
    const { calls, settings, settle, icon } = setup({
      version: 1,
      tray: true,
      dockIcon: false,
    });

    await settings.update("dockIcon", () => true);
    await settle();
    await settings.update("dockIcon", () => false);

    expect(calls).toStrictEqual(["hide", "show", "shown", "redraw", "hide"]);

    await vi.advanceTimersByTimeAsync(DOCK_SHOW_SETTLES_MS);

    expect([calls, icon.isShown()]).toStrictEqual([
      ["hide", "show", "shown", "redraw", "hide", "hide"],
      false,
    ]);
  });

  it("hides nothing more a second after a show that is still wanted", async () => {
    const { calls, settings, settle } = setup({
      version: 1,
      tray: true,
      dockIcon: false,
    });

    await settings.update("dockIcon", () => true);
    await settle();
    await vi.advanceTimersByTimeAsync(DOCK_SHOW_SETTLES_MS);

    expect(calls).toStrictEqual(["hide", "show", "shown", "redraw"]);
  });
});

describe(checkedDockChange, () => {
  it("refuses to turn the icon off while the menu bar icon is off, reading it when run", async () => {
    const { settings } = setup();

    expect(checkedDockChange(settings, false)).toThrow(
      "The Dock icon cannot hide while the menu bar icon is off"
    );

    const whileOff = checkedDockChange(settings, true)();

    await settings.update("tray", () => true);

    expect([whileOff, checkedDockChange(settings, false)()]).toStrictEqual([
      true,
      false,
    ]);
  });
});
