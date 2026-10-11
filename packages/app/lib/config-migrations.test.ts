import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultConfig } from "@meru/shared/config";
import type { Config } from "@meru/shared/types";
import type { CachedStore as CachedStoreClass } from "./cached-store";
import { configMigrations, createConfigOptions } from "./config-migrations";

// electron-store asks Electron's `app` for the user data directory and the app
// version, both of which every store here passes in itself.
mock.module("electron", () => ({ default: {} }));

const { CachedStore } = await import("./cached-store");

const { version: shippedVersion } = JSON.parse(
  await readFile(join(import.meta.dir, "../../../package.json"), "utf8"),
) as { version: string };

/**
 * The store with its keys loosened to plain strings. Every rung in the ladder reads at
 * least one key the current `Config` no longer carries, and the conf patch
 * strips the loose string overloads on purpose, so the ladder spends a
 * `@ts-expect-error` per removed key. One cast here buys the same for the whole
 * file.
 */
type LooseStore = CachedStoreClass<Record<string, any>>;

const defaults = createDefaultConfig({
  accountId: "00000000-0000-0000-0000-000000000000",
  downloadsLocation: "/downloads",
  trayEnabled: true,
});

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "meru-config-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

/** Opens the config store the way `config.ts` does, with the environment stubbed. */
function launch(version: string, ranRungs?: string[]) {
  const store = new CachedStore<Config>({
    cwd,
    name: "config",
    beforeEachMigration: (_store, { toVersion }) => {
      ranRungs?.push(toVersion);
    },
    ...createConfigOptions({ version, defaults: structuredClone(defaults) }),
  });

  return store as unknown as LooseStore;
}

function writeStoredConfig(contents: Record<string, unknown>, migratedVersion?: string) {
  return writeFile(
    join(cwd, "config.json"),
    JSON.stringify(
      migratedVersion
        ? { __internal__: { migrations: { version: migratedVersion } }, ...contents }
        : contents,
    ),
  );
}

function parseRange(range: string) {
  const [, operator, major, minor, patch] = /^(>=?)(\d+)\.(\d+)\.(\d+)$/.exec(range) ?? [];

  if (!operator || !major || !minor || !patch) {
    throw new Error(`The rung keyed \`${range}\` is in a range shape this test can't run.`);
  }

  return { operator, major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/** The lowest version that runs the rung keyed `range`. */
function targetVersion(range: string) {
  const { operator, major, minor, patch } = parseRange(range);

  return operator === ">=" ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
}

/**
 * The version to stamp a stored config with so that the rung keyed `range` is
 * the only one that runs: the highest version that satisfies every rung above
 * it in the ladder and none of `range` itself.
 */
function previousVersion(range: string) {
  const { operator, major, minor, patch } = parseRange(range);

  if (operator === ">") {
    return `${major}.${minor}.${patch}`;
  }

  return patch > 0 ? `${major}.${minor}.${patch - 1}` : `${major}.${minor - 1}.999`;
}

/**
 * Runs the rung keyed `range`, and nothing else, over `stored`, and returns the
 * store once the ladder has settled.
 *
 * Two launches, because conf 14 snapshots the config file before the ladder
 * runs and writes `defaults + snapshot` back afterwards. Any release that adds
 * a default key makes the two differ, so the first launch after an upgrade
 * overwrites everything the ladder wrote — `__internal__.migrations.version`
 * with it — and the rung runs again on the next launch, against a file that now
 * holds every default, and only then sticks. The test below pins that; here it
 * is just the number of launches a stored value takes to appear.
 */
async function migrate(range: string, stored: Record<string, unknown>) {
  await writeStoredConfig(stored, previousVersion(range));

  launch(targetVersion(range));

  const ranRungs: string[] = [];
  const store = launch(targetVersion(range), ranRungs);

  expect(ranRungs).toEqual([range]);

  return store;
}

type Rung = {
  /** The stored config as the version below this rung left it. */
  legacy: Record<string, unknown>;
  /** What the rung has to leave behind, given `legacy`. */
  assertLegacy: (store: LooseStore) => void;
  /** The stored config as this rung's own version writes it. */
  current: Record<string, unknown>;
  /** What the rung has to leave behind, given `current`. */
  assertCurrent: (store: LooseStore) => void;
};

const savedTabUrl = "https://calendar.google.com/";
const bookmarkUrl = "https://drive.google.com/drive/folders/1";

/**
 * Every rung in the ladder, with the two stored shapes that can reach it. The
 * suites below walk `configMigrations` rather than this table, so a rung added
 * without an entry here fails rather than going untested.
 */
const rungs: Record<keyof typeof configMigrations, Rung> = {
  ">=3.4.0": {
    legacy: { showDockIcon: false, accounts: [{ id: "a", label: "A" }] },
    assertLegacy: (store) => {
      expect(store.get("dock.enabled")).toBe(false);
      expect(store.has("showDockIcon")).toBe(false);

      const [account] = store.get("accounts");

      expect(account.unreadBadge).toBe(true);
      expect(account.notifications).toBe(true);
    },
    current: {
      "dock.enabled": false,
      accounts: [{ id: "a", label: "A", unreadBadge: false, notifications: false }],
    },
    assertCurrent: (store) => {
      expect(store.get("dock.enabled")).toBe(false);

      const [account] = store.get("accounts");

      expect(account.unreadBadge).toBe(false);
      expect(account.notifications).toBe(false);
    },
  },
  ">=3.5.0": {
    legacy: { lastWindowState: { bounds: { width: 900, height: 600 }, maximized: true } },
    assertLegacy: (store) => {
      expect(store.get("window.lastState")).toEqual({
        bounds: { width: 900, height: 600 },
        maximized: true,
      });
      expect(store.has("lastWindowState")).toBe(false);
    },
    current: { "window.lastState": { bounds: { width: 900, height: 600 }, maximized: true } },
    assertCurrent: (store) => {
      expect(store.get("window.lastState")).toEqual({
        bounds: { width: 900, height: 600 },
        maximized: true,
      });
      expect(store.has("lastWindowState")).toBe(false);
    },
  },
  ">=3.11.0": {
    legacy: { accounts: [{ id: "a", label: "A" }] },
    assertLegacy: (store) => {
      expect(store.get("accounts")[0].gmail).toEqual({ delegatedAccountId: null });
    },
    current: { accounts: [{ id: "a", label: "A", gmail: { delegatedAccountId: "delegate" } }] },
    assertCurrent: (store) => {
      expect(store.get("accounts")[0].gmail).toEqual({ delegatedAccountId: "delegate" });
    },
  },
  ">=3.15.0": {
    legacy: { "googleApps.openInExternalBrowser": true },
    assertLegacy: (store) => {
      expect(store.get("googleApps.openInApp")).toBe(false);
      // The rung that removes the old key is `">=3.17.0"`, two rungs down.
      expect(store.get("googleApps.openInExternalBrowser")).toBe(true);
    },
    current: { "googleApps.openInApp": true },
    assertCurrent: (store) => {
      expect(store.get("googleApps.openInApp")).toBe(true);
      expect(store.has("googleApps.openInExternalBrowser")).toBe(false);
    },
  },
  ">=3.17.0": {
    legacy: { "googleApps.openInExternalBrowser": false, "googleApps.openInApp": true },
    assertLegacy: (store) => {
      expect(store.has("googleApps.openInExternalBrowser")).toBe(false);
      expect(store.get("googleApps.openInApp")).toBe(true);
    },
    current: { "googleApps.openInApp": true },
    assertCurrent: (store) => {
      expect(store.has("googleApps.openInExternalBrowser")).toBe(false);
      expect(store.get("googleApps.openInApp")).toBe(true);
    },
  },
  ">=3.18.0": {
    legacy: { "app.doNotDisturb": true },
    assertLegacy: (store) => {
      expect(store.has("app.doNotDisturb")).toBe(false);
    },
    current: { "doNotDisturb.enabled": true },
    assertCurrent: (store) => {
      expect(store.has("app.doNotDisturb")).toBe(false);
      expect(store.get("doNotDisturb.enabled")).toBe(true);
    },
  },
  ">=3.19.0": {
    legacy: { accounts: [{ id: "a", label: "A" }] },
    assertLegacy: (store) => {
      expect(store.get("accounts")[0].color).toBeNull();
    },
    current: { accounts: [{ id: "a", label: "A", color: "#ff0000" }] },
    assertCurrent: (store) => {
      expect(store.get("accounts")[0].color).toBe("#ff0000");
    },
  },
  ">=3.31.2": {
    legacy: {
      accounts: [{ id: "a", label: "A", unreadBadge: false, gmail: { delegatedAccountId: null } }],
    },
    assertLegacy: (store) => {
      const [account] = store.get("accounts");

      expect(account.gmail.unreadBadge).toBe(false);
      expect("unreadBadge" in account).toBe(false);
    },
    current: {
      accounts: [{ id: "a", label: "A", gmail: { delegatedAccountId: null, unreadBadge: false } }],
    },
    assertCurrent: (store) => {
      expect(store.get("accounts")[0].gmail.unreadBadge).toBe(false);
    },
  },
  ">=3.35.0": {
    legacy: { "notifications.sound": "bell" },
    assertLegacy: (store) => {
      expect(store.get("notifications.sound")).toBe("linen");
    },
    current: { "notifications.sound": "chime" },
    assertCurrent: (store) => {
      expect(store.get("notifications.sound")).toBe("chime");
    },
  },
  ">3.38.0": {
    legacy: { "downloadHistory.alwaysOpenInNewWindow": true },
    assertLegacy: (store) => {
      expect(store.has("downloadHistory.alwaysOpenInNewWindow")).toBe(false);
    },
    current: {},
    assertCurrent: (store) => {
      expect(store.has("downloadHistory.alwaysOpenInNewWindow")).toBe(false);
    },
  },
  ">3.38.4": {
    legacy: { accounts: [{ id: "a", label: "A", gmail: { delegatedAccountId: null } }] },
    assertLegacy: (store) => {
      expect(store.get("accounts")[0].gmail.unifiedInbox).toBe(true);
    },
    current: {
      accounts: [{ id: "a", label: "A", gmail: { delegatedAccountId: null, unifiedInbox: false } }],
    },
    assertCurrent: (store) => {
      expect(store.get("accounts")[0].gmail.unifiedInbox).toBe(false);
    },
  },
  ">3.39.0": {
    legacy: { "gmail.unreadCountPreference": "default" },
    assertLegacy: (store) => {
      expect(store.get("gmail.unreadCountPreference")).toBe("inbox");
    },
    current: { "gmail.unreadCountPreference": "unread" },
    assertCurrent: (store) => {
      expect(store.get("gmail.unreadCountPreference")).toBe("unread");
    },
  },
  ">3.42.0": {
    legacy: { resetConfig: false },
    assertLegacy: (store) => {
      expect(store.has("resetConfig")).toBe(false);
    },
    current: {},
    assertCurrent: (store) => {
      expect(store.has("resetConfig")).toBe(false);
    },
  },
  ">3.45.0": {
    legacy: { "updates.notificationDelay": 3 },
    assertLegacy: (store) => {
      expect(store.has("updates.notificationDelay")).toBe(false);
    },
    current: {},
    assertCurrent: (store) => {
      expect(store.has("updates.notificationDelay")).toBe(false);
    },
  },
  ">3.51.0": {
    legacy: { hardwareAcceleration: false },
    assertLegacy: (store) => {
      // The rung writes `true` whatever the stored value was, so a user who had
      // hardware acceleration off gets it back on. Pinned rather than fixed:
      // changing a shipped migration changes what it did to profiles that have
      // already run it.
      expect(store.get("app.hardwareAcceleration")).toBe(true);
      expect(store.has("hardwareAcceleration")).toBe(false);
    },
    current: { "app.hardwareAcceleration": false },
    assertCurrent: (store) => {
      expect(store.get("app.hardwareAcceleration")).toBe(false);
    },
  },
  ">3.57.0": {
    legacy: {
      "googleApps.openInApp": false,
      "googleApps.openInAppExcludedApps": ["calendar"],
      "googleApps.openAppsInNewWindow": true,
      "googleApps.pinnedApps": ["calendar"],
      "googleApps.showAccountColor": false,
      "googleApps.showAccountLabel": false,
      "notifications.allowFromGoogleApps": true,
      "gmail.zoomFactor": 1.2,
      "gmail.fullDarkTheme": true,
      accounts: [{ id: "a", label: "A" }],
    },
    assertLegacy: (store) => {
      expect(store.get("workspaceApps.openInApp")).toBe(false);
      expect(store.get("workspaceApps.openInAppExcludedApps")).toEqual(["calendar"]);
      expect(store.get("workspaceApps.launcherApps")).toEqual(["calendar"]);
      expect(store.get("workspaceApps.showAccountColor")).toBe(false);
      expect(store.get("workspaceApps.showAccountLabel")).toBe(false);
      expect(store.get("notifications.allowFromWorkspaceApps")).toBe(true);
      expect(store.get("workspaceApps.zoomFactors")).toEqual({ gmail: 1.2 });
      expect(store.get("gmail.extendDarkTheme")).toBe(true);
      expect(store.get("accounts")[0].workspaceApps).toEqual({ savedTabs: [], bookmarks: [] });

      for (const key of [
        "googleApps.openInApp",
        "googleApps.openInAppExcludedApps",
        "googleApps.openAppsInNewWindow",
        "googleApps.pinnedApps",
        "googleApps.showAccountColor",
        "googleApps.showAccountLabel",
        "notifications.allowFromGoogleApps",
        "workspaceApps.openAppsInNewWindow",
        "gmail.zoomFactor",
        "gmail.fullDarkTheme",
      ]) {
        expect(store.has(key)).toBe(false);
      }
    },
    current: {
      "workspaceApps.openInApp": false,
      "workspaceApps.openInAppExcludedApps": ["calendar"],
      "workspaceApps.launcherApps": ["calendar"],
      "workspaceApps.zoomFactors": { gmail: 1.2 },
      "gmail.extendDarkTheme": true,
      accounts: [
        {
          id: "a",
          label: "A",
          workspaceApps: {
            savedTabs: [{ app: "calendar", url: savedTabUrl, title: "Calendar" }],
            bookmarks: [{ id: "b", app: "drive", url: bookmarkUrl, title: "Drive" }],
          },
        },
      ],
    },
    assertCurrent: (store) => {
      expect(store.get("workspaceApps.openInApp")).toBe(false);
      expect(store.get("workspaceApps.openInAppExcludedApps")).toEqual(["calendar"]);
      expect(store.get("workspaceApps.launcherApps")).toEqual(["calendar"]);
      expect(store.get("workspaceApps.zoomFactors")).toEqual({ gmail: 1.2 });
      expect(store.get("gmail.extendDarkTheme")).toBe(true);
      expect(store.get("accounts")[0].workspaceApps).toEqual({
        savedTabs: [{ app: "calendar", url: savedTabUrl, title: "Calendar" }],
        bookmarks: [{ id: "b", app: "drive", url: bookmarkUrl, title: "Drive" }],
      });
    },
  },
  ">3.58.0": {
    legacy: {
      "workspaceApps.openBehavior": "newWindow",
      accounts: [
        {
          id: "a",
          label: "A",
          workspaceApps: {
            savedTabs: [
              {
                app: "calendar",
                url: savedTabUrl,
                title: "Calendar",
                loadOnLaunch: true,
                windowed: false,
                persistence: "pinned",
              },
              {
                app: "drive",
                url: bookmarkUrl,
                title: "Drive",
                loadOnLaunch: false,
                windowed: false,
                persistence: "bookmarked",
              },
            ],
          },
        },
      ],
    },
    assertLegacy: (store) => {
      expect(store.get("workspaceApps.mode")).toBe("windows");
      expect(store.has("workspaceApps.openBehavior")).toBe(false);
      expect(store.get("notifications.allowFromWorkspaceApps")).toBe(true);

      const { savedTabs, bookmarks } = store.get("accounts")[0].workspaceApps;

      expect(savedTabs).toEqual([
        {
          app: "calendar",
          url: savedTabUrl,
          title: "Calendar",
          loadOnLaunch: true,
          hibernatesWhenIdle: null,
          windowed: false,
          opensLinksForApp: null,
        },
      ]);
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0]).toMatchObject({ app: "drive", url: bookmarkUrl, title: "Drive" });
      expect(bookmarks[0].id).toBeString();
    },
    current: {
      "workspaceApps.mode": "tabs",
      "notifications.allowFromWorkspaceApps": false,
      accounts: [
        {
          id: "a",
          label: "A",
          workspaceApps: {
            savedTabs: [
              {
                app: "calendar",
                url: savedTabUrl,
                title: "Calendar",
                loadOnLaunch: true,
                hibernatesWhenIdle: true,
                windowed: false,
                opensLinksForApp: "calendar",
              },
            ],
            bookmarks: [{ id: "b", app: "drive", url: bookmarkUrl, title: "Drive" }],
          },
        },
      ],
    },
    assertCurrent: (store) => {
      expect(store.get("workspaceApps.mode")).toBe("tabs");
      // Workspace app notifications go on for everyone, so the rung writes
      // `true` over a stored `false` by design.
      expect(store.get("notifications.allowFromWorkspaceApps")).toBe(true);

      // The one rung that rewrites a shape rather than renaming a key, so it is
      // the one rung that cannot be idempotent against its own output: it
      // rebuilds `bookmarks` out of the saved tabs that carried a `persistence`
      // flag, and a store the new version wrote has none. conf's version gate is
      // what keeps it from ever seeing one — pinned here so that reordering the
      // ladder or replaying a rung shows the cost up as a failure.
      const { savedTabs, bookmarks } = store.get("accounts")[0].workspaceApps;

      expect(savedTabs[0]).toMatchObject({ app: "calendar", url: savedTabUrl });
      expect(savedTabs[0].hibernatesWhenIdle).toBeNull();
      expect(savedTabs[0].opensLinksForApp).toBeNull();
      expect(bookmarks).toEqual([]);
    },
  },
  ">=3.60.0": {
    legacy: {
      "workspaceApps.launcherApps": ["calendar", "notebooklm"],
      "workspaceApps.openInAppExcludedApps": ["notebooklm"],
      "workspaceApps.zoomFactors": { notebooklm: 1.2, calendar: 0.9 },
      "verificationCodes.autoCopy": false,
      "verificationCodes.copyMode": "immediately",
      "verificationCodes.confidence": "high",
      accounts: [
        {
          id: "a",
          label: "A",
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
            ],
            bookmarks: [
              {
                id: "b",
                app: "notebooklm",
                url: "https://notebooklm.google.com/notebook/1",
                title: "Research",
              },
            ],
          },
        },
      ],
    },
    assertLegacy: (store) => {
      expect(store.get("workspaceApps.launcherApps")).toEqual(["calendar", "notebook"]);
      expect(store.get("workspaceApps.openInAppExcludedApps")).toEqual(["notebook"]);
      expect(store.get("workspaceApps.zoomFactors")).toEqual({ notebook: 1.2, calendar: 0.9 });
      expect(store.get("verificationCodes.autoCopy")).toBe(true);
      expect(store.get("verificationCodes.copyMode")).toBe("notificationClick");
      expect(store.has("verificationCodes.confidence")).toBe(false);

      const { savedTabs, bookmarks } = store.get("accounts")[0].workspaceApps;

      expect(savedTabs[0].app).toBe("notebook");
      expect(savedTabs[0].opensLinksForApp).toBe("notebook");
      expect(bookmarks[0].app).toBe("notebook");
    },
    current: {
      "workspaceApps.launcherApps": ["calendar", "notebook"],
      "verificationCodes.autoCopy": true,
      "verificationCodes.copyMode": "immediately",
      accounts: [
        {
          id: "a",
          label: "A",
          workspaceApps: {
            savedTabs: [],
            bookmarks: [
              {
                id: "b",
                app: "notebook",
                url: "https://notebook.google.com/notebook/1",
                title: "Research",
              },
            ],
          },
        },
      ],
    },
    assertCurrent: (store) => {
      expect(store.get("workspaceApps.launcherApps")).toEqual(["calendar", "notebook"]);
      // Someone who went and turned copying on keeps the mode they chose.
      expect(store.get("verificationCodes.copyMode")).toBe("immediately");
      expect(store.get("accounts")[0].workspaceApps.bookmarks[0].app).toBe("notebook");
    },
  },
  ">=3.60.1": {
    legacy: {
      "extensions.showTitlebarButton": true,
      "verticalTabs.hideUnreadBadgeWhenActive": true,
    },
    assertLegacy: (store) => {
      expect(store.get("verticalTabs.gmailUnreadBadge")).toBe("whenInactive");
      expect(store.has("extensions.showTitlebarButton")).toBe(false);
      expect(store.has("verticalTabs.hideUnreadBadgeWhenActive")).toBe(false);
    },
    current: { "verticalTabs.gmailUnreadBadge": "never" },
    assertCurrent: (store) => {
      expect(store.get("verticalTabs.gmailUnreadBadge")).toBe("never");
      expect(store.has("extensions.showTitlebarButton")).toBe(false);
    },
  },
};

const ladder = Object.keys(configMigrations) as (keyof typeof rungs)[];

// A rung that reads a key without guarding it throws, conf restores its backup
// and rethrows, and the `new CachedStore(...)` at the top of `config.ts` takes
// the main process down with it — an app that cannot launch at all. The
// `">=3.60.0"` rung shipped exactly that, and only a release build caught it,
// because CI's end-to-end suite is the only thing that launches the app on a
// fresh profile and a rung keyed above the shipped version never runs.
//
// Every suite here runs a rung at a version that reaches it rather than only at
// the version being shipped, so the rung written next release is covered without
// anyone remembering to add a case.
describe("a profile with no config file", () => {
  // conf hands a migration the file as it sits on disk and nothing else, so the
  // store here is empty and every read comes back `undefined`. What that covers
  // is the top-level reads: with no `accounts` key there is nothing to iterate,
  // so the guards inside that loop never execute. The suite after this is what
  // reaches those.
  for (const range of ladder) {
    test(`survives the ladder up to ${targetVersion(range)} (\`${range}\`)`, () => {
      expect(() => launch(targetVersion(range))).not.toThrow();
    });
  }

  test("survives the ladder at the version being shipped", () => {
    // `resolveMigrationVersion` resolves a prerelease to its base version, so a
    // Beta is the first build to run the newest rung for real. This case is
    // wired to `package.json` rather than to a version named here.
    expect(() => launch(shippedVersion)).not.toThrow();
  });

  test("comes up on the shipped defaults", () => {
    const store = launch(shippedVersion);

    expect(store.get("workspaceApps.launcherApps")).toEqual([]);
    expect(store.get("workspaceApps.zoomFactors")).toEqual({});
    expect(store.get("accounts")).toHaveLength(1);
  });
});

describe("an account with nothing but an id", () => {
  // The bare minimum an account can be on disk, and the only thing that reaches
  // the reads inside the `accounts` loop, which the suite above skips for want
  // of an `accounts` key.
  for (const range of ladder) {
    test(`survives the ladder up to ${targetVersion(range)} (\`${range}\`)`, async () => {
      await writeStoredConfig({ accounts: [{ id: "a", label: "A" }] });

      expect(() => launch(targetVersion(range))).not.toThrow();
    });
  }
});

describe("a stored config the version below each rung left", () => {
  for (const range of ladder) {
    test(`\`${range}\` migrates it`, async () => {
      const rung = rungs[range];

      rung.assertLegacy(await migrate(range, rung.legacy));
    });
  }
});

describe("a stored config already in the shape each rung writes", () => {
  for (const range of ladder) {
    test(`\`${range}\` leaves it as the new version wrote it`, async () => {
      const rung = rungs[range];

      rung.assertCurrent(await migrate(range, rung.current));
    });
  }
});

describe("a stored config with an account the rung's own reads need repairing", () => {
  // A profile stamped past `">=3.11.0"` whose account carries no `gmail` is
  // what a hand-edited or partially written file looks like, and `">=3.11.0"`
  // is the rung that would have added it. Both rungs below read through
  // `account.gmail`, and before they guarded it either one took the app down at
  // module load.
  for (const range of [">=3.31.2", ">3.38.4"] as const) {
    test(`\`${range}\` skips an account with no gmail settings`, async () => {
      await writeStoredConfig(
        { accounts: [{ id: "a", label: "A", unreadBadge: false }] },
        previousVersion(range),
      );

      expect(() => launch(targetVersion(range))).not.toThrow();
    });
  }
});

describe("the launch a migration's writes land on", () => {
  test("is the second, because conf 14 writes its pre-migration snapshot back", async () => {
    // conf 14.0.0 snapshots the config file, computes `defaults + snapshot`,
    // runs the ladder, and then writes that snapshot back if it differs from
    // the file it read. Neither snapshot reflects the migration, so any release
    // that adds a default key overwrites everything the ladder wrote — the
    // migration version with it — and the ladder runs again on the next launch,
    // against a file that now holds every default, and sticks.
    //
    // conf's behavior rather than ours, pinned here so that changing conf shows
    // up as a failure here rather than in the field.
    await writeStoredConfig(
      { "workspaceApps.launcherApps": ["calendar", "notebooklm"] },
      previousVersion(">=3.60.0"),
    );

    const first = launch(targetVersion(">=3.60.0"));

    expect(first.get("workspaceApps.launcherApps")).toEqual(["calendar", "notebooklm"]);

    const second = launch(targetVersion(">=3.60.0"));

    expect(second.get("workspaceApps.launcherApps")).toEqual(["calendar", "notebook"]);
  });
});
