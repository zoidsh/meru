import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import {
  NO_TRIAL,
  SHELL_URL,
  expect,
  findPage,
  test,
  writeSettings,
} from "./lib/app.ts";
import {
  askedRemovals,
  confirmRemovals,
  openSection,
  openSettings,
  seedProfiles,
} from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

const HOUR = 60 * 60;
const KEY = "MERU-TEST-AAAA-BBBB-CCCC-7Q2K";
const DETAIL =
  "You'll be signed out of every profile and lose all your settings. This can't be undone.";
const LICENSE_PARAGRAPH =
  "This also removes your Meru Pro license from this device. You can activate it again with your key.";

const read = async (userDataDir: string, ...file: string[]) => {
  try {
    return await readFile(path.join(userDataDir, ...file), "utf-8");
  } catch {
    return "";
  }
};

const readJson = async (userDataDir: string, file: string) =>
  JSON.parse((await read(userDataDir, file)) || "{}") as Record<
    string,
    unknown
  >;

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

interface Snapshot {
  status: string;
  licenseKey: string | null;
}

const snapshot = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestEntitlement") as {
        snapshot: () => Snapshot;
      }
    ).snapshot()
  );

const activate = (app: ElectronApplication) =>
  app.evaluate(
    (_electron, key) =>
      (
        Reflect.get(globalThis, "meruTestEntitlement") as {
          activate: (key: string) => Promise<{ ok: boolean }>;
        }
      ).activate(key),
    KEY
  );

/** Each value the test build's login item was asked to take, in order. */
const loginItemCalls = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestLoginItem") as { calls: boolean[] })
        .calls
  );

const openAdvanced = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openSection(page, "Advanced");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Advanced");

  return page;
};

const resetButton = (page: Page) =>
  page.getByRole("button", { name: "Reset Meru" });

test("Reset Meru asks first, then removes the license, ends the app with the relaunch asked, and the next launch is a first run with every profile signed out and the trial as it was", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seedProfiles(userDataDir, standIn, ["Work", "Home"]);
  await writeSettings(userDataDir, { theme: "dark", confirmLinks: false });
  await writeFile(
    path.join(userDataDir, "gmail-user-styles.css"),
    "body { color: red; }"
  );
  await writeFile(path.join(userDataDir, "state.corrupt-1.json"), "garbage");

  const first = await launchApp();

  await findPage(first, SHELL_URL);
  await expect.poll(() => snapshot(first)).toMatchObject({ status: "trial" });
  await expect(activate(first)).resolves.toStrictEqual({ ok: true });
  await keepCookie(first, "work", standIn.url);
  await keepCookie(first, "home", standIn.url);

  const stub = await readJson(userDataDir, "entitlement-stub.json");

  expect(stub.trialStartedAt).toStrictEqual(expect.any(Number));

  const page = await openAdvanced(first);
  const troubleshooting = page.getByRole("group", { name: "Troubleshooting" });

  await expect(resetButton(page)).toHaveText("Reset…");
  await expect(resetButton(page)).toHaveAccessibleDescription(
    "Signs you out of every profile and deletes all your settings and data on this computer."
  );
  // The last row of the group.
  await expect(troubleshooting.getByRole("button").last()).toHaveAccessibleName(
    "Reset Meru"
  );

  // Cancel: nothing changes, and the page stays.
  await confirmRemovals(first, false);
  await resetButton(page).click();
  await expect.poll(() => askedRemovals(first)).toHaveLength(1);

  const [asked] = await askedRemovals(first);

  expect(asked).toMatchObject({
    type: "warning",
    message: "Reset Meru?",
    detail: `${DETAIL}\n\n${LICENSE_PARAGRAPH}`,
    buttons: ["Reset", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    window: "Settings",
  });
  await expect(resetButton(page)).toBeEnabled();
  await expect(page.getByText("Couldn't reset Meru. Try again.")).toHaveCount(
    0
  );
  expect(await listed(userDataDir)).not.toContain("reset-pending");
  expect(await readJson(userDataDir, "entitlement.json")).toMatchObject({
    licenseKey: KEY,
  });
  expect(await cookieNames(first, "work")).toContain("kept");

  // Reset: the license goes, the marker is left, and the app ends in place
  // of relaunching.
  const output: string[] = [];

  first.process().stderr?.on("data", (chunk: Buffer) => {
    output.push(chunk.toString());
  });
  await confirmRemovals(first, true);
  // Held, so the login item can be read before the app ends.
  await first.evaluate(({ app: electronApp }) => {
    Reflect.set(globalThis, "meruTestExit", electronApp.exit.bind(electronApp));
    electronApp.exit = () => {
      Reflect.set(globalThis, "meruTestExited", true);
    };
  });
  await resetButton(page).click();
  await expect
    .poll(() => first.evaluate(() => Reflect.get(globalThis, "meruTestExited")))
    .toBe(true);
  expect(await loginItemCalls(first)).toStrictEqual(
    process.platform === "linux" ? [] : [false]
  );

  const closed = first.waitForEvent("close");

  await first.evaluate(() => {
    const exit = Reflect.get(globalThis, "meruTestExit") as (
      code: number
    ) => void;

    setTimeout(() => {
      exit(0);
    }, 0);
  });
  await closed;

  expect(output.join("")).toContain("meruTestRelaunch: relaunch");
  expect(await listed(userDataDir)).toContain("reset-pending");

  const entitlementAfterReset = await readJson(userDataDir, "entitlement.json");

  expect(entitlementAfterReset).not.toHaveProperty("licenseKey");
  expect(entitlementAfterReset).not.toHaveProperty("token");
  expect(await readJson(userDataDir, "entitlement-stub.json")).toMatchObject({
    trialStartedAt: stub.trialStartedAt,
    deactivations: 1,
    licenses: {},
  });

  // The next launch, on the same folder and with no trial seeded, so the
  // trial it shows is the one the server kept.
  const second = await launchApp(NO_TRIAL);
  const shell = await findPage(second, SHELL_URL);

  await expect
    .poll(() => read(userDataDir, "logs", "main.log"))
    .toContain("meru-reset-wiped");

  const log = await read(userDataDir, "logs", "main.log");
  const [started, wiped] = log.split("\n");

  expect(started).toContain("run-started");
  expect(wiped).toContain("meru-reset-wiped kept=0");
  expect(log).not.toContain("reset-delete-failed");

  const files = await listed(userDataDir);

  expect(files).not.toContain("reset-pending");
  expect(files).not.toContain("gmail-user-styles.css");
  expect(files).not.toContain("state.corrupt-1.json");

  const partitions = await listed(path.join(userDataDir, "Partitions"));

  expect(partitions).not.toContain("work");
  expect(partitions).not.toContain("home");
  expect(await cookieNames(second, "work")).toStrictEqual([]);
  expect(await cookieNames(second, "home")).toStrictEqual([]);

  // One default profile, so no profile row, and default settings.
  await expect(shell.getByRole("group", { name: "Profiles" })).toHaveCount(0);

  const state = await readJson(userDataDir, "state.json");

  expect(state.profiles).toStrictEqual([
    expect.objectContaining({ name: "Default" }),
  ]);
  expect(await readJson(userDataDir, "settings.json")).not.toHaveProperty(
    "theme"
  );
  await expect
    .poll(() => snapshot(second))
    .toMatchObject({ status: "trial", licenseKey: null });
  expect(await readJson(userDataDir, "entitlement-stub.json")).toMatchObject({
    trialStartedAt: stub.trialStartedAt,
  });
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the Advanced page with the Reset Meru row, light and dark", async ({
    app,
  }) => {
    const page = await openAdvanced(app);

    // The description, which wraps below the button.
    await page
      .getByText("Signs you out of every profile", { exact: false })
      .scrollIntoViewIfNeeded();
    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-advanced-reset", theme),
      });
    }
  });
});
