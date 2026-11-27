import path from "node:path";

import { describe, expect, it } from "vitest";

import { silentLog } from "#core/log.fake.ts";
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
        entitlementFile: fileAt("entitlement.json"),
        newId: () => "new-id",
        now: () => 1_763_290_000_000,
        log: silentLog,
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

  it("writes no state or settings when the entitlement is newer", async () => {
    const directory = createFakeDirectory({
      "state.json": "{ not json",
      "settings.json": "{ not json",
      "entitlement.json": NEWER,
    });

    await expect(directory.load()).rejects.toBeInstanceOf(StartupError);
    expect(Object.fromEntries(directory.files)).toStrictEqual({
      [path.join(DIR, "state.json")]: "{ not json",
      [path.join(DIR, "settings.json")]: "{ not json",
      [path.join(DIR, "entitlement.json")]: NEWER,
    });
  });

  it("creates every file when there are none", async () => {
    const directory = createFakeDirectory({});
    const { state, settings, entitlement } = await directory.load();

    expect(state.selectedProfileId).toBe("new-id");
    expect(settings).toStrictEqual({ version: 1 });
    expect(entitlement).toStrictEqual({ version: 1 });
    expect([...directory.files.keys()].toSorted()).toStrictEqual([
      path.join(DIR, "entitlement.json"),
      path.join(DIR, "settings.json"),
      path.join(DIR, "state.json"),
    ]);
  });

  it("keeps an unreadable entitlement aside and starts it afresh", async () => {
    const directory = createFakeDirectory({
      "entitlement.json": "{ not json",
    });
    const { entitlement } = await directory.load();

    expect(entitlement).toStrictEqual({ version: 1 });
    expect(
      directory.files.get(
        path.join(DIR, "entitlement.corrupt-1763290000000.json")
      )
    ).toBe("{ not json");
  });

  it("reads an entitlement with keys it does not know, keeping them", async () => {
    const found = { version: 1, token: 7, later: { kept: true } };
    const directory = createFakeDirectory({
      "entitlement.json": JSON.stringify(found),
    });

    const { entitlement } = await directory.load();

    expect(entitlement).toStrictEqual(found);
  });
});
