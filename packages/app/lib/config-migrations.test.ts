import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultConfig } from "@meru/shared/config";
import type { Config } from "@meru/shared/types";
import type { CachedStore as CachedStoreClass } from "./cached-store";
import { createConfigOptions } from "./config-migrations";

// electron-store asks Electron's `app` for the user data directory and the app
// version, both of which every store here passes in itself.
mock.module("electron", () => ({ default: {} }));

const { CachedStore } = await import("./cached-store");

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
function launch(version: string) {
  const store = new CachedStore<Config>({
    cwd,
    name: "config",
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
