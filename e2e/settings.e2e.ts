import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import {
  clickMenuItem,
  expect,
  findPage,
  test,
  writeSettings,
} from "./lib/app.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

const SETTINGS_URL = "meru-app://settings/";

/** How many Settings windows are open. */
const settingsWindows = (app: ElectronApplication) =>
  app.evaluate(
    ({ BrowserWindow }, url) =>
      BrowserWindow.getAllWindows().filter(
        (window) =>
          !window.isDestroyed() && window.webContents.getURL().startsWith(url)
      ).length,
    SETTINGS_URL
  );

/** Runs Settings… from the app menu, and gives the Settings window's page. */
const openSettings = async (app: ElectronApplication) => {
  // The menu is set once startup has wired it.
  await expect
    .poll(() =>
      app.evaluate(
        ({ Menu }) =>
          Menu.getApplicationMenu()?.getMenuItemById("app.settings") !== null
      )
    )
    .toBe(true);
  await clickMenuItem(app, "app.settings");

  const page = await findPage(app, SETTINGS_URL);

  await expect(
    page.getByRole("switch", { name: "Do Not Disturb" })
  ).toBeVisible();

  return page;
};

/** One value of `settings.json` as the app wrote it, or nothing before its first write. */
const readStoredSetting = async (userDataDir: string, key: string) => {
  let stored: Record<string, unknown> = {};

  try {
    stored = JSON.parse(
      await readFile(path.join(userDataDir, "settings.json"), "utf-8")
    ) as Record<string, unknown>;
  } catch {
    // Not written yet.
  }

  return stored[key];
};

const setSetting = (app: ElectronApplication, key: string, value: unknown) =>
  app.evaluate(
    async (_electron, change) => {
      const settings = Reflect.get(globalThis, "meruTestSettings") as {
        set: (key: string, value: unknown) => Promise<void>;
      };

      await settings.set(change.key, change.value);
    },
    { key, value }
  );

const pausedLines = (page: Page) =>
  page.getByText("Off while Do Not Disturb is on");

test("Settings… opens one Settings window, which closes and opens again", async ({
  app,
  shell,
}) => {
  await expect(shell.getByRole("banner", { name: "Title bar" })).toBeVisible();

  const page = await openSettings(app);

  await expect(
    page.getByRole("heading", { name: "Notifications" })
  ).toBeVisible();

  await clickMenuItem(app, "app.settings");

  expect(await settingsWindows(app)).toBe(1);

  await page.close();

  await expect.poll(() => settingsWindows(app)).toBe(0);

  await openSettings(app);

  expect(await settingsWindows(app)).toBe(1);
});

test("a switch writes the app value, which a restart keeps", async ({
  launchApp,
  userDataDir,
}) => {
  const app = await launchApp();
  const page = await openSettings(app);
  const summary = page.getByRole("switch", { name: "Show the summary" });

  await expect(summary).toBeChecked();

  await summary.click();

  await expect(summary).not.toBeChecked();
  await expect
    .poll(() => readStoredSetting(userDataDir, "notificationSummary"))
    .toBe(false);

  await app.close();

  const again = await openSettings(await launchApp());

  await expect(
    again.getByRole("switch", { name: "Show the summary" })
  ).not.toBeChecked();
});

test("a value set elsewhere shows in the open window", async ({ app }) => {
  const page = await openSettings(app);
  const sender = page.getByRole("switch", { name: "Show the sender" });

  await expect(sender).toBeChecked();

  await setSetting(app, "notificationSender", false);

  await expect(sender).not.toBeChecked();
});

test("Do Not Disturb from the titlebar turns the row on and pauses the rows it outranks, whose switch turns it off", async ({
  app,
  shell,
}) => {
  const page = await openSettings(app);
  const row = page.getByRole("switch", { name: "Do Not Disturb" });
  const moon = shell
    .getByRole("banner", { name: "Title bar" })
    .getByRole("button", { name: "Do Not Disturb" });

  await expect(row).not.toBeChecked();
  await expect(pausedLines(page)).toHaveCount(0);

  await moon.click();

  await expect(row).toBeChecked();
  await expect(
    page.getByText("On until you turn it off. Holds every notification.")
  ).toBeVisible();
  // Notifications, Important mail only, Sound and Quiet hours.
  await expect(pausedLines(page)).toHaveCount(4);
  await expect(
    page.getByRole("switch", { name: "Notifications" })
  ).toBeChecked();

  await row.click();

  await expect(moon).toHaveAttribute("aria-pressed", "false");
  await expect(pausedLines(page)).toHaveCount(0);
});

test("quiet hours are added, a day changed and removed, each edit writing the whole list", async ({
  app,
  userDataDir,
}) => {
  const page = await openSettings(app);
  const quietHours = () => readStoredSetting(userDataDir, "quietHours");

  await page.getByRole("button", { name: "Add quiet hours" }).click();

  const window = page.getByRole("group", { name: "Quiet hours 1" });

  // Base UI's select icon holds a "▼" that the chevron drawn over it hides.
  await expect(window.getByRole("combobox", { name: "From" })).toHaveText(
    /^22:00/u
  );
  await expect
    .poll(quietHours)
    .toStrictEqual([{ start: "22:00", end: "07:00" }]);

  await window.getByRole("button", { name: "Saturday" }).click();

  await expect(
    window.getByRole("button", { name: "Saturday" })
  ).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(quietHours)
    .toStrictEqual([
      { start: "22:00", end: "07:00", days: [0, 1, 2, 3, 4, 5] },
    ]);

  await window.getByRole("button", { name: "Remove quiet hours 1" }).click();

  await expect(window).toHaveCount(0);
  await expect.poll(quietHours).toStrictEqual([]);
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the Notifications page light and dark, with Do Not Disturb on, and with two windows of quiet hours", async ({
    launchApp,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, {
      quietHours: [
        { start: "23:00", end: "07:00", days: [1, 2, 3, 4, 5] },
        { start: "00:00", end: "00:00", days: [0, 6] },
      ],
    });

    const app = await launchApp();
    const page = await openSettings(app);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await page.screenshot({
        path: shotPath("settings-notifications", theme),
      });
    }

    await emulateTheme(app, "light");
    await page.getByRole("switch", { name: "Do Not Disturb" }).click();
    await expect(pausedLines(page)).toHaveCount(4);
    // Lets the switch's transition finish.
    await delay(500);
    await page.screenshot({
      path: shotPath("settings-notifications-do-not-disturb"),
    });

    await page.getByRole("switch", { name: "Do Not Disturb" }).click();
    await expect(pausedLines(page)).toHaveCount(0);
    await page
      .getByRole("group", { name: "Quiet hours 2" })
      .evaluate((group) => {
        group.scrollIntoView({ block: "center" });
      });
    await delay(500);
    await page.screenshot({
      path: shotPath("settings-notifications-quiet-hours"),
    });
  });
});
