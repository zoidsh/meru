import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  createUserDataDir,
  expect,
  launchArgs,
  removeUserDataDir,
  spawnApp,
  test,
} from "./lib/app.ts";

/*
 * `--print-user-data` exists only in the e2e build. It prints where the app
 * would keep its data and exits before it creates the folder or takes its
 * lock, so asking what a build would use never touches a real profile.
 */

const printUserData = async (args: string[]) => {
  const app = spawnApp([...args, "--print-user-data"]);

  try {
    expect(await app.exited).toBe(0);

    const output = await app.output();

    return output.trim().split("\n").at(-1) ?? "";
  } finally {
    await app.stop();
  }
};

const readVersion = async () => {
  const manifest = JSON.parse(
    await readFile(
      path.join(import.meta.dirname, "..", "package.json"),
      "utf-8"
    )
  ) as { version: string };

  return manifest.version;
};

test("a -dev build keeps its data apart from an installed Meru's", async () => {
  const version = await readVersion();

  test.skip(!version.includes("-dev"), `${version} is not a -dev build`);

  const userData = await printUserData([]);

  expect(path.basename(userData)).toBe("Meru Dev");

  // A folder left by a packaged dev build run by hand says nothing about
  // whether asking created it; where there is none, asking must not make one.
  if (existsSync(userData)) {
    test.info().annotations.push({
      type: "note",
      description: `${userData} already exists, so not creating it went unchecked`,
    });
  } else {
    await printUserData([]);
    expect(existsSync(userData)).toBe(false);
  }
});

test("a --user-data-dir always wins", async () => {
  const dir = await createUserDataDir();

  try {
    // macOS's temporary folder is reached through a symlink, which the app
    // resolves.
    expect(await realpath(await printUserData(launchArgs(dir)))).toBe(
      await realpath(dir)
    );
  } finally {
    await removeUserDataDir(dir);
  }
});
