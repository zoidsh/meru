import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { DAY } from "#core/entitlement.ts";

import { NO_TRIAL, expect, readViews, test } from "./lib/app.ts";
import {
  launchWithMail,
  openProfiles,
  openSection,
  openSettings,
  pollAll,
  profileRow,
  switchNamed,
} from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

const FIRST_FORM =
  "Turn this off if pages flicker or stay blank. You'll need to restart Meru.";
const RESTART_FORM =
  "Turn this off if pages flicker or stay blank. Restart Meru to apply the change.";

const openAdvanced = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openSection(page, "Advanced");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Advanced");

  return page;
};

const acceleration = (page: Page) =>
  switchNamed(page, "Use hardware acceleration");

const readStored = async (userDataDir: string) => {
  try {
    return JSON.parse(
      await readFile(path.join(userDataDir, "settings.json"), "utf-8")
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const storedAcceleration = async (userDataDir: string) => {
  const stored = await readStored(userDataDir);

  return stored.hardwareAcceleration;
};

/** Each content view's page and session, in the window's order. */
const viewPages = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views.map(({ url, partition }) => ({ url, partition }));
};

const SYSTEM_PICKER = "Use the macOS screen picker";

const systemPicker = (page: Page) => switchNamed(page, SYSTEM_PICKER);

/** Whether each guarded session asks macOS for its picker, by partition. */
const sessionsUseSystemPicker = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (
        Reflect.get(globalThis, "meruTestScreenSources") as {
          systemPicker: Record<string, boolean>;
        }
      ).systemPicker
  );

const openedPaths = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestPathOpener") as { opened: string[] })
        .opened
  );

test("sits last in Privacy & Security's group with its two cards, no scopes and nothing Pro during the trial", async ({
  app,
}) => {
  const page = await openAdvanced(app);
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  const names = await nav.getByRole("button").allTextContents();

  expect(names.slice(names.indexOf("Privacy & Security"))).toStrictEqual([
    "Privacy & Security",
    "Advanced",
    "Meru Pro",
    "About",
  ]);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByText("Pro", { exact: true })).toHaveCount(0);

  await expect(acceleration(page)).toBeChecked();
  await expect(acceleration(page)).toHaveAccessibleDescription(FIRST_FORM);

  const troubleshooting = page.getByRole("group", { name: "Troubleshooting" });

  await expect(
    troubleshooting.getByRole("button", { name: "Open settings file" })
  ).toHaveAccessibleDescription("Opens settings.json in your text editor.");
  await expect(
    troubleshooting.getByRole("button", { name: "Clear cache" })
  ).toHaveAccessibleDescription(
    "Clears saved pages and images for all profiles."
  );
});

test("on macOS the first card has Use the macOS screen picker, on, whose change reaches every session at once; elsewhere it has no such row", async ({
  app,
}) => {
  const page = await openAdvanced(app);

  if (process.platform !== "darwin") {
    await expect(page.getByText(SYSTEM_PICKER)).toHaveCount(0);
    expect(
      Object.values(await sessionsUseSystemPicker(app)).every((used) => !used)
    ).toBeTruthy();

    return;
  }

  await expect(systemPicker(page)).toBeChecked();
  await expect(systemPicker(page)).toHaveAccessibleDescription(
    "macOS asks which screen or window you want to share."
  );
  await expect
    .poll(async () => Object.values(await sessionsUseSystemPicker(app)))
    .toStrictEqual([true]);

  await systemPicker(page).click();
  await expect(systemPicker(page)).not.toBeChecked();
  await expect
    .poll(async () => Object.values(await sessionsUseSystemPicker(app)))
    .toStrictEqual([false]);
});

test("on the free version the macOS screen picker is a Pro row, disabled, and every session shows Meru's picker", async ({
  launchApp,
  userDataDir,
}) => {
  test.skip(process.platform !== "darwin", "the row is on macOS alone");

  // A trial that ended, with no license.
  await writeFile(
    path.join(userDataDir, "entitlement-stub.json"),
    JSON.stringify({ trialStartedAt: Date.now() - 15 * DAY, licenses: {} })
  );

  const app = await launchApp(NO_TRIAL);
  const page = await openAdvanced(app);

  await expect(
    page.getByRole("button", {
      name: `Meru Pro ${SYSTEM_PICKER}`,
      exact: true,
    })
  ).toBeVisible();
  await expect(systemPicker(page)).toBeDisabled();
  await expect(systemPicker(page)).not.toBeChecked();
  await expect
    .poll(async () => Object.values(await sessionsUseSystemPicker(app)))
    .toStrictEqual([false]);
});

test("turning hardware acceleration off says to restart, and the next launch runs without it", async ({
  launchApp,
  userDataDir,
}) => {
  const app = await launchApp();

  const atFirstLaunch = await app.evaluate(({ app: electron }) =>
    electron.isHardwareAccelerationEnabled()
  );

  // Only a Mac is sure to have a GPU Chromium uses. Xvfb on Linux and a
  // Windows runner may have none, and then the first launch already reports
  // what a launch with acceleration turned off does, so there the relaunch
  // shows only that it stays off.
  expect(atFirstLaunch || process.platform !== "darwin").toBeTruthy();

  const page = await openAdvanced(app);

  await acceleration(page).click();
  await expect(acceleration(page)).not.toBeChecked();
  await expect(acceleration(page)).toHaveAccessibleDescription(RESTART_FORM);
  await expect.poll(() => storedAcceleration(userDataDir)).toBe(false);

  // Back to what the run started with, there is nothing to restart for.
  await acceleration(page).click();
  await expect(acceleration(page)).toHaveAccessibleDescription(FIRST_FORM);
  await acceleration(page).click();
  await expect(acceleration(page)).toHaveAccessibleDescription(RESTART_FORM);
  await expect.poll(() => storedAcceleration(userDataDir)).toBe(false);

  await app.close();

  const again = await launchApp();

  expect(
    await again.evaluate(({ app: electron }) =>
      electron.isHardwareAccelerationEnabled()
    )
  ).toBeFalsy();

  const reopened = await openAdvanced(again);

  await expect(acceleration(reopened)).not.toBeChecked();
  await expect(acceleration(reopened)).toHaveAccessibleDescription(FIRST_FORM);
});

test("Open hands settings.json to the system, saved first when there is none yet", async ({
  launchApp,
  userDataDir,
}) => {
  const file = path.join(userDataDir, "settings.json");
  const app = await launchApp();
  const page = await openAdvanced(app);

  // As a person who deleted it while Meru ran.
  await rm(file, { force: true });
  await page.getByRole("button", { name: "Open settings file" }).click();

  await expect.poll(() => openedPaths(app)).toStrictEqual([file]);
  expect(JSON.parse(await readFile(file, "utf-8"))).toStrictEqual({
    version: 1,
  });
});

test("Clear cache shows Cleared, with every profile still signed in and its tabs kept", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app } = await launchWithMail(launchApp, userDataDir, standIn, [
    {
      id: "home",
      name: "Home",
      feed: { unreadCount: 0, address: "home@example.org" },
    },
    {
      id: "work",
      name: "Work",
      feed: { unreadCount: 0, address: "work@example.com" },
    },
  ]);
  const page = await openSettings(app);

  await openProfiles(page);
  await expect(profileRow(page, "Work")).toHaveAccessibleDescription(
    "work@example.com"
  );

  const views = await viewPages(app);

  await openSection(page, "Advanced");
  await page.getByRole("button", { name: "Clear cache" }).click();
  await expect(page.getByRole("button", { name: "Cleared" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear cache" })).toBeEnabled();

  await expect.poll(() => viewPages(app)).toStrictEqual(views);
  await expect
    .poll(() =>
      app.evaluate(({ session }) =>
        Promise.all(
          ["persist:home", "persist:work"].map((partition) =>
            session
              .fromPartition(partition)
              .cookies.get({})
              .then((cookies) => cookies.some(({ name }) => name === "account"))
          )
        )
      )
    )
    .toStrictEqual([true, true]);

  await pollAll(app);
  await openProfiles(page);
  await expect(profileRow(page, "Home")).toHaveAccessibleDescription(
    "home@example.org"
  );
  await expect(profileRow(page, "Work")).toHaveAccessibleDescription(
    "work@example.com"
  );
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the page, and with the switch changed, light and dark", async ({
    app,
  }) => {
    const page = await openAdvanced(app);
    const shoot = async (surface: string) => {
      for (const theme of THEMES) {
        // oxlint-disable-next-line no-await-in-loop -- one theme at a time
        await emulateTheme(app, theme);
        // oxlint-disable-next-line no-await-in-loop -- one after another
        await page.screenshot({ path: shotPath(surface, theme) });
      }
    };

    await shoot("settings-advanced");
    await acceleration(page).click();
    await expect(acceleration(page)).toHaveAccessibleDescription(RESTART_FORM);
    await shoot("settings-advanced-restart");
  });
});
