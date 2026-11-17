import path from "node:path";

import { describe, expect, it } from "vitest";

import { fakeTextFile } from "#platform/text-file.fake.ts";

import { StartupError } from "./failures.ts";
import { loadStores } from "./stores.ts";

const DIR = path.join("/data", "Meru Dev");

/** A directory of files in memory, with `contents` by file name. */
const createFakeDirectory = (contents: Record<string, string>) => {
  const files = new Map(
    Object.entries(contents).map(([name, text]) => [path.join(DIR, name), text])
  );

  const fileAt = (name: string) => fakeTextFile(path.join(DIR, name), files);

  return {
    files,
    load: () =>
      loadStores({
        stateFile: fileAt("state.json"),
        settingsFile: fileAt("settings.json"),
        newId: () => "new-id",
        now: () => 1_763_290_000_000,
        log: () => {},
      }),
  };
};

const NEWER = JSON.stringify({ version: 2 });

describe(loadStores, () => {
  it("writes no state when the settings are newer", async () => {
    const directory = createFakeDirectory({
      "state.json": "{ not json",
      "settings.json": NEWER,
    });

    await expect(directory.load()).rejects.toBeInstanceOf(StartupError);
    expect(Object.fromEntries(directory.files)).toStrictEqual({
      [path.join(DIR, "state.json")]: "{ not json",
      [path.join(DIR, "settings.json")]: NEWER,
    });
  });

  it("writes no settings when the state is newer", async () => {
    const directory = createFakeDirectory({
      "state.json": NEWER,
      "settings.json": "{ not json",
    });

    await expect(directory.load()).rejects.toBeInstanceOf(StartupError);
    expect(Object.fromEntries(directory.files)).toStrictEqual({
      [path.join(DIR, "state.json")]: NEWER,
      [path.join(DIR, "settings.json")]: "{ not json",
    });
  });

  it("creates both files when there are none", async () => {
    const directory = createFakeDirectory({});
    const { state, settings } = await directory.load();

    expect(state.selectedProfileId).toBe("new-id");
    expect(settings).toStrictEqual({ version: 1 });
    expect([...directory.files.keys()].toSorted()).toStrictEqual([
      path.join(DIR, "settings.json"),
      path.join(DIR, "state.json"),
    ]);
  });
});
