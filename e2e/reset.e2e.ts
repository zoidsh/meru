import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication } from "@playwright/test";

import { SHELL_URL, expect, findPage, test } from "./lib/app.ts";
import { seedProfiles } from "./lib/settings.ts";

const HOUR = 60 * 60;

/** The log as the file holds it, empty while there is none yet. */
const readLog = async (userDataDir: string) => {
  try {
    return await readFile(path.join(userDataDir, "logs", "main.log"), "utf-8");
  } catch {
    return "";
  }
};

const listed = async (folder: string) => {
  try {
    return await readdir(folder);
  } catch {
    return [];
  }
};

/** A cookie that outlives the run, written to the profile's session on disk. */
const keepCookie = (app: ElectronApplication, profileId: string, url: string) =>
  app.evaluate(
    async ({ session }, { partition, address, expires }) => {
      const { cookies } = session.fromPartition(partition);

      await cookies.set({
        url: address,
        name: "kept",
        value: partition,
        expirationDate: expires,
      });
      await cookies.flushStore();
    },
    {
      partition: `persist:${profileId}`,
      address: url,
      expires: Date.now() / 1000 + HOUR,
    }
  );

const cookieNames = (app: ElectronApplication, profileId: string) =>
  app.evaluate(async ({ session }, partition) => {
    const cookies = await session.fromPartition(partition).cookies.get({});

    return cookies.map(({ name }) => name);
  }, `persist:${profileId}`);

/**
 * Ends the app at once, as the suite's stand-in for the relaunch does, so the
 * next launch starts while the system may still hold what this run had open.
 */
const exitNow = async (app: ElectronApplication) => {
  const closed = app.waitForEvent("close");

  await app.evaluate(({ app: electronApp }) => {
    setTimeout(() => {
      electronApp.exit(0);
    }, 0);
  });
  await closed;
};

test("a launch that finds the reset's marker deletes every profile's session before any exists, signing each out", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seedProfiles(userDataDir, standIn, ["Work", "Home"]);

  const first = await launchApp();

  await findPage(first, SHELL_URL);
  await keepCookie(first, "work", standIn.url);
  await keepCookie(first, "home", standIn.url);
  expect(await cookieNames(first, "work")).toContain("kept");
  await writeFile(path.join(userDataDir, "reset-pending"), "");
  await exitNow(first);
  expect(await listed(path.join(userDataDir, "Partitions"))).toStrictEqual(
    expect.arrayContaining(["work", "home"])
  );

  const second = await launchApp();

  await findPage(second, SHELL_URL);
  await expect.poll(() => readLog(userDataDir)).toContain("meru-reset-wiped");

  const log = await readLog(userDataDir);

  expect(log).toContain("meru-reset-wiped kept=0");
  expect(log).not.toContain("reset-delete-failed");
  expect(log.split("\n")[0]).toContain("run-started");
  expect(log.split("\n")[1]).toContain("meru-reset-wiped");
  expect(await listed(userDataDir)).not.toContain("reset-pending");

  const partitions = await listed(path.join(userDataDir, "Partitions"));

  expect(partitions).not.toContain("work");
  expect(partitions).not.toContain("home");
  expect(await cookieNames(second, "work")).toStrictEqual([]);
  expect(await cookieNames(second, "home")).toStrictEqual([]);
});
