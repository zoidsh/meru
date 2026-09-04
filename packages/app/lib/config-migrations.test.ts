import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultConfig } from "@meru/shared/config";
import type { Config } from "@meru/shared/types";
// `conf` is the store electron-store extends, and electron-store itself is
// unimportable here because it pulls in Electron. Reaching for conf directly
// rather than declaring a dependency of our own keeps the test on the exact
// copy the app runs.
import Conf from "conf";
import { configMigrations, createConfigOptions } from "./config-migrations";

const { version: shippedVersion } = JSON.parse(
  await readFile(join(import.meta.dir, "../../../package.json"), "utf8"),
);

/**
 * The lowest version that runs a migration keyed `>=x.y.z` or `>x.y.z`, which
 * is every shape the ladder uses. Anything else throws rather than quietly
 * leaving a migration untested.
 */
function resolveLowestVersion(range: string) {
  const [, operator, major, minor, patch] = /^(>=?)(\d+)\.(\d+)\.(\d+)$/.exec(range) ?? [];

  if (!operator) {
    throw new Error(`The migration keyed \`${range}\` is in a range shape this test can't run.`);
  }

  return operator === ">="
    ? `${major}.${minor}.${patch}`
    : `${major}.${minor}.${Number(patch) + 1}`;
}

/** The lowest version that runs each migration in the ladder. */
const ladder = Object.keys(configMigrations).map((range) => ({
  range,
  version: resolveLowestVersion(range),
}));

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "meru-config-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function writeStoredConfig(contents: Record<string, unknown>) {
  return writeFile(join(cwd, "config.json"), JSON.stringify(contents));
}

/** Opens the config store the way `config.ts` does, with the environment stubbed. */
function launch(version: string) {
  return new Conf<Config>({
    cwd,
    configName: "config",
    ...createConfigOptions({
      version,
      defaults: createDefaultConfig({
        accountId: "00000000-0000-0000-0000-000000000000",
        downloadsLocation: "/downloads",
        trayEnabled: true,
      }),
    }),
  });
}

/**
 * A config as 3.59.0 left it, carrying `notebooklm` in every place an app key
 * is stored. `__internal__` is what conf reads to decide which migrations still
 * have to run, so this is a profile that has run the ladder up to 3.59.0.
 */
function createStoredConfig() {
  return {
    __internal__: { migrations: { version: "3.59.0" } },
    accounts: [
      {
        id: "account-id",
        label: "Default",
        color: null,
        selected: true,
        notifications: true,
        gmail: { unreadBadge: true, delegatedAccountId: null, unifiedInbox: true },
        workspaceApps: {
          savedTabs: [
            {
              app: "notebooklm",
              url: "https://notebooklm.google.com/",
              title: "NotebookLM",
              loadOnLaunch: true,
              hibernatesWhenIdle: null,
              windowed: false,
              opensLinksForApp: "notebooklm",
            },
            {
              app: "calendar",
              url: "https://calendar.google.com/",
              title: "Calendar",
              loadOnLaunch: false,
              hibernatesWhenIdle: null,
              windowed: false,
              opensLinksForApp: null,
            },
          ],
          bookmarks: [
            {
              id: "bookmark-id",
              app: "notebooklm",
              url: "https://notebooklm.google.com/notebook/1",
              title: "Research",
            },
          ],
        },
      },
    ],
    "workspaceApps.launcherApps": ["calendar", "notebooklm"],
    "workspaceApps.openInAppExcludedApps": ["notebooklm"],
    "workspaceApps.zoomFactors": { notebooklm: 1.2, calendar: 0.9 },
    "verificationCodes.autoCopy": false,
    "verificationCodes.copyMode": "immediately",
    "verificationCodes.confidence": "high",
  };
}

// A migration that reads a key without guarding it throws, conf restores its
// backup and rethrows, and the `new Store(...)` at the top of `config.ts` takes
// the main process down with it — an app that cannot launch at all. 3.60.0's
// migration shipped exactly that, and only a release build caught it.
//
// Both suites below run the whole ladder at every version that runs a rung,
// rather than only at the version being shipped. That is the gap this bug came
// through: a rung keyed above the current version never runs, so CI was green
// on `">=3.60.0"` for as long as `package.json` read 3.59.0, and the release
// build was the first thing to execute it. Iterating the keys closes it for the
// rung written next release too, without anyone remembering to add a case.
describe("the ladder over a profile with no config file", () => {
  // conf merges the defaults in only *after* the migrations have run, so the
  // store here is completely empty and every read comes back `undefined`. What
  // that covers is the top-level reads: with no `accounts` key there is nothing
  // to iterate, so the guards inside that loop never execute. The suite below
  // is what reaches those.
  for (const { range, version } of ladder) {
    test(`survives the ladder up to ${version} (\`${range}\`)`, () => {
      expect(() => launch(version)).not.toThrow();
    });
  }

  test("survives the ladder at the version being shipped", () => {
    // `resolveMigrationVersion` resolves a prerelease to its base version, so a
    // Beta is the first build to run the newest migration for real. This is the
    // rung above that matters: it is wired to `package.json` rather than to a
    // version this file names.
    expect(() => launch(shippedVersion)).not.toThrow();
  });

  test("comes up on the shipped defaults", () => {
    const config = launch(shippedVersion);

    expect(config.get("workspaceApps.launcherApps")).toEqual([]);
    expect(config.get("workspaceApps.zoomFactors")).toEqual({});
    expect(config.get("accounts")).toHaveLength(1);
  });
});

describe("the ladder over an account with nothing but an id", () => {
  // The bare minimum an account can be on disk, and the only thing that reaches
  // the reads inside the `accounts` loop, which the suite above skips for want
  // of an `accounts` key. Two of those reads are unguarded on purpose:
  // `account.gmail.unreadBadge` in `">=3.31.2"` and `account.gmail.unifiedInbox`
  // in `">3.38.4"` would both throw on an account with no `gmail`, and what
  // keeps them standing is ordering rather than a check — `">=3.11.0"` writes
  // `gmail` on any account that lacks it, and it sits above both. Running the
  // whole ladder from `0.0.0` is what holds that arrangement in place.
  //
  // These rungs do not reach the `account.workspaceApps` guard: `">3.57.0"`
  // backfills that key on the way past. Only a profile that has already run the
  // ladder can arrive at `">=3.60.0"` without it, which is what the last test
  // in this file is for.
  for (const { range, version } of ladder) {
    test(`survives the ladder up to ${version} (\`${range}\`)`, async () => {
      await writeStoredConfig({ accounts: [{ id: "account-id", label: "Default" }] });

      expect(() => launch(version)).not.toThrow();
    });
  }
});

describe("an upgrade from 3.59.0", () => {
  test("keeps a stored profile intact on the launch that writes the new defaults", async () => {
    // conf takes its snapshot of the file *before* migrating and writes
    // `defaults + snapshot` back afterwards, so the first launch of a release
    // that adds a default key throws the migration's writes away and leaves
    // `__internal__` where it was. The ladder runs again on the next launch,
    // against a file that now holds every default, and sticks. This is conf
    // 14's behavior, not ours, and it is pinned here so that changing conf or
    // the defaults shows up as a failure here rather than in the field.
    await writeStoredConfig(createStoredConfig());

    const config = launch(shippedVersion);

    expect(config.get("workspaceApps.launcherApps") as string[]).toEqual([
      "calendar",
      "notebooklm",
    ]);
  });

  test("renames NotebookLM everywhere its app key is stored", async () => {
    await writeStoredConfig(createStoredConfig());

    launch(shippedVersion);

    const config = launch(shippedVersion);

    expect(config.get("workspaceApps.launcherApps")).toEqual(["calendar", "notebook"]);
    expect(config.get("workspaceApps.openInAppExcludedApps")).toEqual(["notebook"]);
    expect(config.get("workspaceApps.zoomFactors")).toEqual({ notebook: 1.2, calendar: 0.9 });

    const [account] = config.get("accounts");

    expect(account?.workspaceApps.savedTabs.map((savedTab) => savedTab.app)).toEqual([
      "notebook",
      "calendar",
    ]);
    expect(account?.workspaceApps.savedTabs.map((savedTab) => savedTab.opensLinksForApp)).toEqual([
      "notebook",
      null,
    ]);
    expect(account?.workspaceApps.bookmarks.map((bookmark) => bookmark.app)).toEqual(["notebook"]);
  });

  test("promotes a user who had verification code copying off", async () => {
    await writeStoredConfig(createStoredConfig());

    launch(shippedVersion);

    const config = launch(shippedVersion);

    expect(config.get("verificationCodes.autoCopy")).toBe(true);
    expect(config.get("verificationCodes.copyMode")).toBe("notificationClick");
    // @ts-expect-error: `verificationCodes.confidence` has been removed
    expect(config.has("verificationCodes.confidence")).toBe(false);
  });

  test("leaves the copy mode of a user who had copying on alone", async () => {
    await writeStoredConfig({
      ...createStoredConfig(),
      "verificationCodes.autoCopy": true,
      "verificationCodes.copyMode": "immediately",
    });

    launch(shippedVersion);

    const config = launch(shippedVersion);

    expect(config.get("verificationCodes.copyMode")).toBe("immediately");
  });

  test("migrates a profile that is missing the keys the ladder reads", async () => {
    // The regression test for the crash: a stored profile that has run the
    // ladder but carries none of the keys the rename reads, so those reads come
    // back `undefined` exactly as they do on a fresh profile. Hand-edited and
    // partially written config files land here.
    await writeStoredConfig({
      __internal__: { migrations: { version: "3.59.0" } },
      accounts: [{ id: "account-id", label: "Default" }],
      "verificationCodes.autoCopy": false,
    });

    expect(() => launch(shippedVersion)).not.toThrow();

    const config = launch(shippedVersion);

    expect(config.get("workspaceApps.launcherApps")).toEqual([]);
    expect(config.get("workspaceApps.zoomFactors")).toEqual({});
    expect(config.get("accounts")[0]?.workspaceApps).toEqual({ savedTabs: [], bookmarks: [] });
    expect(config.get("verificationCodes.autoCopy")).toBe(true);
  });
});
