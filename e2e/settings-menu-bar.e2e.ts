import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { expect, test, writeSettings } from "./lib/app.ts";
import { openSection, openSettings, switchNamed } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

const isMacOS = process.platform === "darwin";

/** The section's name, as the platform names Meru's icons outside its window. */
const SECTION = isMacOS ? "Menu Bar & Dock" : "Tray & Taskbar";

const TRAY = isMacOS ? "Show in menu bar" : "Show in system tray";

const TRAY_OFF = `Turn on ${TRAY} first.`;

/** `settings.json` as the app wrote it, or nothing before its first write. */
const readStored = async (userDataDir: string) => {
  try {
    return JSON.parse(
      await readFile(path.join(userDataDir, "settings.json"), "utf-8")
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/** Each Dock call the suite's build recorded in place of the real Dock. */
const dockCalls = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestDock") as string[] | undefined) ?? []
  );

const openPage = async (page: Page) => {
  await openSection(page, SECTION);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(SECTION);
};

const iconColor = (page: Page) =>
  page.getByRole("combobox", { name: "Icon color" });

test("is named after the platform's places in the sidebar and the title", async ({
  app,
}) => {
  const page = await openSettings(app);
  const sections = page.getByRole("navigation", { name: "Settings sections" });

  await expect(sections.getByRole("button").nth(2)).toHaveText(SECTION);
  await openPage(page);
  await expect(page.getByRole("tablist")).toHaveCount(0);
});

test("with the tray off, the rows under it are disabled and say why, and come back with their values", async ({
  launchApp,
  userDataDir,
}) => {
  await writeSettings(userDataDir, {
    tray: false,
    trayJumpsToUnread: true,
    trayUnreadCount: false,
    trayIconColor: "dark",
  });

  const app = await launchApp();
  const page = await openSettings(app);
  const jump = switchNamed(page, "Jump to unread mail");
  const middle = isMacOS
    ? switchNamed(page, "Show unread count")
    : iconColor(page);

  await openPage(page);
  await expect(switchNamed(page, TRAY)).not.toBeChecked();

  for (const control of [middle, jump]) {
    // oxlint-disable-next-line no-await-in-loop -- one row after another
    await expect(control).toBeDisabled();
    // oxlint-disable-next-line no-await-in-loop -- one row after another
    await expect(control).toHaveAccessibleDescription(TRAY_OFF);
  }

  await switchNamed(page, TRAY).click();

  await expect(jump).toBeEnabled();
  await expect(jump).toBeChecked();
  await expect(jump).toHaveAccessibleDescription(
    "Clicking the icon opens the first profile that has unread mail."
  );
  await expect(middle).toBeEnabled();

  await (isMacOS
    ? expect(middle).not.toBeChecked()
    : expect(middle).toContainText("Dark"));
  await expect
    .poll(async () => {
      const stored = await readStored(userDataDir);

      return stored.tray;
    })
    .toBe(true);
});

test("each control shows the stored value and writes the one it is turned to", async ({
  launchApp,
  userDataDir,
}) => {
  await writeSettings(userDataDir, { tray: true });

  const app = await launchApp();
  const page = await openSettings(app);

  await openPage(page);
  await switchNamed(page, "Jump to unread mail").click();

  if (isMacOS) {
    await switchNamed(page, "Show unread count").click();
  } else {
    await iconColor(page).click();
    await page.getByRole("option", { name: "Light" }).click();
    await expect(iconColor(page)).toContainText("Light");
  }

  await expect
    .poll(async () => {
      const stored = await readStored(userDataDir);

      return [
        stored.trayJumpsToUnread,
        isMacOS ? stored.trayUnreadCount : stored.trayIconColor,
      ];
    })
    .toStrictEqual([true, isMacOS ? false : "light"]);
});

test.describe("the Dock", () => {
  test.skip(!isMacOS, "The Dock is macOS's alone");

  test("Show in Dock waits for the menu bar icon, hides the recorded Dock icon, and the menu bar icon going shows it again", async ({
    app,
    userDataDir,
  }) => {
    const page = await openSettings(app);
    const dock = switchNamed(page, "Show in Dock");

    await openPage(page);
    await expect(dock).toBeChecked();
    await expect(dock).toBeDisabled();
    await expect(dock).toHaveAccessibleDescription(TRAY_OFF);

    await switchNamed(page, TRAY).click();
    await expect(dock).toBeEnabled();
    await expect(dock).toHaveAccessibleDescription(
      "If you hide it, you can still open Meru from the menu bar."
    );
    await dock.click();

    await expect(dock).not.toBeChecked();
    await expect.poll(() => dockCalls(app)).toStrictEqual(["hide"]);

    await switchNamed(page, TRAY).click();

    await expect(dock).toBeChecked();
    await expect(dock).toBeDisabled();
    await expect.poll(() => dockCalls(app)).toStrictEqual(["hide", "show"]);
    await expect
      .poll(async () => {
        const stored = await readStored(userDataDir);

        return [stored.tray, stored.dockIcon];
      })
      .toStrictEqual([false, true]);
  });

  test("a file with both off shows the Dock icon, left as found, the switch on and disabled", async ({
    launchApp,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, { tray: false, dockIcon: false });

    const app = await launchApp();
    const page = await openSettings(app);

    await openPage(page);
    await expect(switchNamed(page, "Show in Dock")).toBeChecked();
    await expect(switchNamed(page, "Show in Dock")).toBeDisabled();
    expect(await dockCalls(app)).toStrictEqual([]);
    expect(await readStored(userDataDir)).toMatchObject({
      tray: false,
      dockIcon: false,
    });
  });

  test("from a file with both off, turning the menu bar icon on keeps the Dock icon its switch showed, and stores it", async ({
    launchApp,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, { tray: false, dockIcon: false });

    const app = await launchApp();
    const page = await openSettings(app);
    const dock = switchNamed(page, "Show in Dock");

    await openPage(page);
    await switchNamed(page, TRAY).click();

    await expect(dock).toBeEnabled();
    await expect(dock).toBeChecked();
    await expect
      .poll(async () => {
        const stored = await readStored(userDataDir);

        return [stored.tray, stored.dockIcon];
      })
      .toStrictEqual([true, true]);
    expect(await dockCalls(app)).toStrictEqual([]);
  });

  test("a hidden Dock icon hides at launch", async ({
    launchApp,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, { tray: true, dockIcon: false });

    const app = await launchApp();

    await expect.poll(() => dockCalls(app)).toStrictEqual(["hide"]);
  });
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the page, and with the tray off, light and dark", async ({
    launchApp,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, { tray: true });

    const app = await launchApp();
    const page = await openSettings(app);
    const shoot = async (surface: string) => {
      for (const theme of THEMES) {
        // oxlint-disable-next-line no-await-in-loop -- one theme at a time
        await emulateTheme(app, theme);
        // oxlint-disable-next-line no-await-in-loop -- one after another
        await page.screenshot({ path: shotPath(surface, theme) });
      }
    };

    await openPage(page);
    await shoot("settings-menu-bar");

    await switchNamed(page, TRAY).click();
    await expect(switchNamed(page, "Jump to unread mail")).toBeDisabled();
    await shoot("settings-menu-bar-tray-off");
  });
});
