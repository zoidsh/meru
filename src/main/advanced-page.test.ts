import { describe, expect, it } from "vitest";

import { newProfile } from "#core/state.ts";
import type { Profile, State } from "#core/state.ts";
import { fakeTextFile } from "#platform/text-file.fake.ts";

import { createAdvancedPage } from "./advanced-page.ts";
import { createDeleteBrowsingData } from "./browsing-data.ts";
import { createSettingsStore, saveSettings } from "./settings.ts";

const FILE = "/data/settings.json";

/**
 * The page over a settings file in memory, the store saving to it, and Delete
 * browsing data's own path over sessions and views that record each step.
 */
const setup = ({
  stored,
  failing = [],
  openFails = false,
}: {
  /** The file as found; nothing for none yet. */
  stored?: string;
  /** Partitions whose clear is refused. */
  failing?: string[];
  openFails?: boolean;
} = {}) => {
  const files = new Map<string, string>();

  if (stored !== undefined) {
    files.set(FILE, stored);
  }

  const settingsFile = fakeTextFile(FILE, files);
  const settings = createSettingsStore({
    initial: { version: 1, theme: "dark" },
    save: (next) => saveSettings(settingsFile, next),
    platform: "darwin",
    log: () => false,
  });
  const steps: string[] = [];
  const logs: string[] = [];
  const state: State = {
    version: 1,
    profiles: [
      newProfile("work", "Work"),
      { ...newProfile("home", "Home"), disabled: true },
      { ...newProfile("side", "Side"), asleep: true },
    ] as Profile[],
    selectedProfileId: "work",
  };
  const page = createAdvancedPage({
    hardwareAccelerationAtLaunch: true,
    settingsFile,
    settings,
    opener: {
      open: (path) => {
        steps.push(`open ${path} holding ${files.get(path) ?? "nothing"}`);

        return openFails
          ? Promise.reject(new Error("no application knows .json"))
          : Promise.resolve();
      },
    },
    profiles: {
      get: () => state,
      locked: () => [newProfile("spare", "Spare")],
    },
    deleteBrowsingData: createDeleteBrowsingData({
      sessions: {
        clearData: (partition, dataTypes) => {
          steps.push(`clear ${partition} ${dataTypes.join(",")}`);

          return failing.includes(partition)
            ? Promise.reject(new Error("the session refused"))
            : Promise.resolve();
        },
      },
      views: {
        sleepAllButGmail: (profileId) => {
          steps.push(`sleep all but Gmail of ${profileId}`);
        },
        reloadProfile: (profileId) => {
          steps.push(`reload ${profileId}`);
        },
      },
      mail: {
        poke: (profileId) => {
          steps.push(`poll ${profileId}`);
        },
      },
    }),
    log: (message) => {
      logs.push(message);
    },
  });

  return { page, files, steps, logs };
};

describe(createAdvancedPage, () => {
  it("says what hardware acceleration the run started with", () => {
    expect(setup().page.read()).toStrictEqual({
      hardwareAccelerationAtLaunch: true,
    });
  });

  it("saves the current settings before opening the file when there is none yet", async () => {
    const { page, files, steps } = setup();

    await page.openSettingsFile();

    expect(files.get(FILE)).toBe(
      `${JSON.stringify({ version: 1, theme: "dark" }, null, 2)}\n`
    );
    expect(steps).toStrictEqual([`open ${FILE} holding ${files.get(FILE)}`]);
  });

  it("opens the file as found, writing nothing, when there is one", async () => {
    const { page, files, steps } = setup({ stored: "{ hand edited" });

    await page.openSettingsFile();

    expect(files.get(FILE)).toBe("{ hand edited");
    expect(steps).toStrictEqual([`open ${FILE} holding { hand edited`]);
  });

  it("logs a file that could not be opened and answers nothing else", async () => {
    const { page, logs } = setup({ stored: "{}", openFails: true });

    await expect(page.openSettingsFile()).resolves.toBeUndefined();
    expect(logs).toStrictEqual([
      `${FILE} was not opened: no application knows .json`,
    ]);
  });

  it("clears the cache alone of every profile, disabled, asleep and unused ones included, and reloads each one's pages", async () => {
    const { page, steps } = setup();

    await page.clearCache();

    expect(steps.toSorted()).toStrictEqual(
      [
        "clear persist:work cache",
        "clear persist:home cache",
        "clear persist:side cache",
        "clear persist:spare cache",
        "reload work",
        "reload home",
        "reload side",
        "reload spare",
      ].toSorted()
    );
  });

  it("clears and reloads every other profile when one fails, then rejects and logs which", async () => {
    const { page, steps, logs } = setup({ failing: ["persist:home"] });

    await expect(page.clearCache()).rejects.toThrow("home");
    expect(steps.filter((step) => step.startsWith("reload"))).toHaveLength(4);
    expect(logs).toStrictEqual([
      "The cache of profile home was not cleared: the session refused",
    ]);
  });
});
