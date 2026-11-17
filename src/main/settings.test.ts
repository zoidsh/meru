import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Settings } from "#core/settings.ts";
import { fakeTextFile } from "#platform/text-file.fake.ts";
import type { TextFile } from "#platform/text-file.ts";

import { StartupError } from "./failures.ts";
import { createSettingsStore, openSettings } from "./settings.ts";

const SETTINGS_PATH = path.join("/data", "Meru Dev", "settings.json");

const createFakeFile = (contents?: string) => {
  const files = new Map<string, string>(
    contents === undefined ? [] : [[SETTINGS_PATH, contents]]
  );

  return { file: fakeTextFile(SETTINGS_PATH, files), files };
};

const load = async (file: TextFile) => {
  const opened = await openSettings({
    file,
    now: () => 1_763_290_000_000,
    log: () => {},
  });

  await opened.settle();

  return opened.value;
};

describe(openSettings, () => {
  it("touches nothing on disk until it settles", async () => {
    const { file, files } = createFakeFile("{ not json");

    await openSettings({ file, now: () => 1, log: () => {} });

    expect([...files]).toStrictEqual([[SETTINGS_PATH, "{ not json"]]);
  });

  it("starts and saves an empty file when there is none", async () => {
    const { file, files } = createFakeFile();

    await expect(load(file)).resolves.toStrictEqual({ version: 1 });
    expect(JSON.parse(files.get(SETTINGS_PATH) ?? "")).toStrictEqual({
      version: 1,
    });
  });

  it("keeps a file it cannot read aside and starts afresh", async () => {
    const { file, files } = createFakeFile("{ not json");

    await expect(load(file)).resolves.toStrictEqual({ version: 1 });
    expect(
      files.get(
        path.join("/data", "Meru Dev", "settings.corrupt-1763290000000.json")
      )
    ).toBe("{ not json");
  });

  it("stops startup on a newer file and touches nothing", async () => {
    const text = JSON.stringify({ version: 2 });
    const { file, files } = createFakeFile(text);

    await expect(load(file)).rejects.toBeInstanceOf(StartupError);
    expect([...files]).toStrictEqual([[SETTINGS_PATH, text]]);
  });
});

const setup = (initial: Settings, failSave = false) => {
  const saved: unknown[] = [];
  const settings = createSettingsStore({
    initial,
    save: (next) => {
      if (failSave) {
        return Promise.reject(new Error("disk full"));
      }

      saved.push(structuredClone(next));

      return Promise.resolve();
    },
    platform: "darwin",
    log: () => {},
  });

  return { settings, saved };
};

describe(createSettingsStore, () => {
  it("keeps the design and vibrancy an earlier build wrote when another setting changes", async () => {
    const found = { version: 1, design: "classic", vibrancy: false };
    const { file } = createFakeFile(JSON.stringify(found));
    const { settings, saved } = setup(await load(file));

    await settings.update("unreadBadge", () => false);

    expect(saved).toStrictEqual([{ ...found, unreadBadge: false }]);
  });

  it("saves a change before it reads back, and keeps the rest of the file as found", async () => {
    const { settings, saved } = setup({
      version: 1,
      trayIconColor: "glass",
      later: 1,
    });

    expect(settings.get("trayIconColor")).toBe("system");

    await settings.update("unreadBadge", () => false);

    expect(settings.get("unreadBadge")).toBeFalsy();
    expect(saved).toStrictEqual([
      { version: 1, trayIconColor: "glass", later: 1, unreadBadge: false },
    ]);
  });

  it("announces a change to that key's listeners alone, and nothing when the value stays", async () => {
    const { settings } = setup({ version: 1 });
    const heard: string[] = [];

    settings.onChange("trayIconColor", () =>
      heard.push(settings.get("trayIconColor"))
    );
    settings.onChange("unreadBadge", () => heard.push("unreadBadge"));

    await settings.update("trayIconColor", () => "dark");
    await settings.update("trayIconColor", () => "dark");
    await settings.update("trayIconColor", () => "system");

    expect(heard).toStrictEqual(["dark", "system"]);
  });

  it("announces nothing for setting a value that did not parse to its default", async () => {
    const { settings, saved } = setup({ version: 1, trayIconColor: "glass" });
    const heard: string[] = [];

    settings.onChange("trayIconColor", () => heard.push("trayIconColor"));
    await settings.update("trayIconColor", () => "system");

    expect(heard).toStrictEqual([]);
    expect(saved).toStrictEqual([{ version: 1, trayIconColor: "system" }]);
  });

  it("leaves the old value standing when the save fails", async () => {
    const { settings } = setup({ version: 1 }, true);
    const heard: string[] = [];

    settings.onChange("trayIconColor", () => heard.push("trayIconColor"));

    await expect(
      settings.update("trayIconColor", () => "dark")
    ).rejects.toThrow("disk full");
    expect(settings.get("trayIconColor")).toBe("system");
    expect(heard).toStrictEqual([]);
  });
});
