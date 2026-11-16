import { existsSync, readdirSync, rmdirSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { isDevVersion } from "../packages/core/src/app-identity.ts";
import { expect, launchArgs, test } from "./lib/app.ts";
import type { SpawnedApp } from "./lib/app.ts";

/*
 * `--print-user-data` exists only in the e2e build. It prints where the app
 * would keep its data, or why it refuses to start, and exits before it creates
 * the folder or takes its lock, so asking never touches a real profile.
 */

/** Electron's `appData`, known before the app is asked. */
const appData = () => {
  switch (process.platform) {
    case "darwin": {
      return path.join(homedir(), "Library", "Application Support");
    }
    case "win32": {
      return process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming");
    }
    default: {
      return process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config");
    }
  }
};

const installed = path.join(appData(), "Meru");
const devFolder = path.join(appData(), "Meru Dev");

const readVersion = async () => {
  const manifest = JSON.parse(
    await readFile(
      path.join(import.meta.dirname, "..", "package.json"),
      "utf-8"
    )
  ) as { version: string };

  return manifest.version;
};

const ask = async (
  spawnApp: (args: string[]) => Promise<SpawnedApp>,
  args: string[]
) => {
  const app = await spawnApp([...args, "--print-user-data"]);
  const code = await app.exited;

  return { code, printed: app.stdout().trim(), refusal: app.stderr() };
};

/**
 * Runs `body` and reports which of the two folders it created, with what each
 * holds, removing what it created empty so a failure leaves no stray folder.
 */
const watchFolders = async (body: () => Promise<void>) => {
  const existedBefore = new Map(
    [installed, devFolder].map((dir) => [dir, existsSync(dir)])
  );
  const created = new Map<string, string[]>();

  try {
    await body();
  } finally {
    for (const [dir, existed] of existedBefore) {
      if (!existed && existsSync(dir)) {
        const contents = readdirSync(dir);

        created.set(dir, contents);

        // Anything holding files is left for a person to look at.
        if (contents.length === 0) {
          rmdirSync(dir);
        }
      }
    }
  }

  return created;
};

test.describe("a -dev build", () => {
  // One at a time, since each watches the same two folders.
  test.describe.configure({ mode: "default" });

  test.beforeEach(async () => {
    const version = await readVersion();

    test.skip(!isDevVersion(version), `${version} is not a -dev build`);
  });

  for (const [label, args] of [
    ["no --user-data-dir", []],
    ["an empty --user-data-dir", ["--user-data-dir="]],
    ["a bare --user-data-dir", ["--user-data-dir"]],
  ] as const) {
    test(`given ${label}, keeps its data apart from an installed Meru's`, async ({
      spawnApp,
    }) => {
      const created = await watchFolders(async () => {
        const { code, printed } = await ask(spawnApp, [...args]);

        expect(code).toBe(0);
        expect(printed).toBe(devFolder);
      });

      expect([...created.keys()]).toStrictEqual([]);
    });
  }

  test("refuses an installed Meru's folder named outright, writing nothing", async ({
    spawnApp,
  }) => {
    const created = await watchFolders(async () => {
      const { code, refusal } = await ask(spawnApp, [
        `--user-data-dir=${installed}`,
      ]);

      expect(code).toBe(2);
      expect(refusal).toMatch(/installed Meru/u);
    });

    // Electron creates a directory named by --user-data-dir before the app's
    // own code runs, so the most the app can promise is to leave it empty.
    expect([...created.values()].flat()).toStrictEqual([]);
    expect(created.has(devFolder)).toBeFalsy();
  });
});

test("a --user-data-dir of its own always wins", async ({
  spawnApp,
  userDataDir,
}) => {
  const { code, printed } = await ask(spawnApp, launchArgs(userDataDir));

  expect(code).toBe(0);
  // macOS's temporary folder is reached through a symlink.
  expect(await realpath(printed)).toBe(await realpath(userDataDir));
});
