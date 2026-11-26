import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { DAY } from "#core/entitlement.ts";

import {
  NO_TRIAL,
  SHELL_URL,
  chooseContextMenuItem,
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  openContextMenu,
  readOpenedExternally,
  readState,
  readViews,
  stubSystemBrowser,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { openSection, openSettings, switchNamed } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
import { CALENDAR_TITLE, DRIVE_TITLE } from "./lib/stand-in.ts";
import type { StandIn } from "./lib/stand-in.ts";

const IN_MERU = "Open Google apps in Meru";
const IN_BROWSER = "Always open in your default browser";
const SWITCHED_OFF = "Google apps open in your default browser.";
const TURN_ON_FIRST = "Turn on Open Google apps in Meru first.";

const SLEEP_IDLE = "Sleep idle tabs";
const SLEEP_AFTER = "Sleep after";
const SLEEP_WHEN_IDLE = "Sleep When Idle";

/** The apps the menu offers, in the registry's order: every one but Gmail. */
const OFFERED = ["Calendar", "Drive", "Docs", "Sheets", "Slides", "Meet"];

const readStored = async (userDataDir: string) => {
  try {
    return JSON.parse(
      await readFile(path.join(userDataDir, "settings.json"), "utf-8")
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const openTabsApps = async (page: Page) => {
  await openSection(page, "Tabs & Google Apps");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tabs & Google Apps"
  );
};

/** The menu's button, named by its row's label and what it reads. */
const menuButton = (page: Page, summary?: string) =>
  page.getByRole("button", {
    name:
      summary === undefined
        ? new RegExp(`^${IN_BROWSER}\\b`, "u")
        : `${IN_BROWSER} ${summary}`,
  });

/** The URL each content view shows. */
const viewUrls = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views.map(({ url }) => url);
};

test("opens from the sidebar after Gmail with no scopes, the menu listing every Google app but Gmail, and a Sleep group of two menus at their defaults", async ({
  app,
}) => {
  const page = await openSettings(app);
  const sections = page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button");

  await expect(sections).toContainText(["Gmail", "Tabs & Google Apps"]);

  const names = await sections.allTextContents();

  expect(names.indexOf("Tabs & Google Apps")).toBe(names.indexOf("Gmail") + 1);

  await openTabsApps(page);
  await expect(page.getByRole("tablist")).toHaveCount(0);

  const group = page.getByRole("group", { name: "Opening Google apps" });

  await expect(group.getByRole("switch", { name: IN_MERU })).toBeChecked();
  await expect(
    group.getByRole("switch", { name: IN_MERU })
  ).not.toHaveAccessibleDescription(SWITCHED_OFF);
  await expect(menuButton(page, "None")).toBeEnabled();

  await menuButton(page).click();
  await expect(page.getByRole("menuitemcheckbox")).toHaveText(OFFERED);

  for (const item of await page.getByRole("menuitemcheckbox").all()) {
    // oxlint-disable-next-line no-await-in-loop -- one item after another
    await expect(item).not.toBeChecked();
  }

  await page.keyboard.press("Escape");

  const sleep = page.getByRole("group", { name: "Sleep" });
  const which = sleep.getByRole("combobox", { name: SLEEP_IDLE });
  const after = sleep.getByRole("combobox", { name: SLEEP_AFTER });

  await expect(which).toContainText("Unpinned tabs");
  await expect(which).toHaveAccessibleDescription(
    "Sleeping tabs free up memory and reload when you open them."
  );
  await expect(after).toContainText("1 hour");
  await expect(after).toHaveAccessibleDescription(
    "Your current tab, tabs in separate windows and tabs playing sound stay awake."
  );

  await which.click();
  await expect(page.getByRole("option")).toHaveText([
    "Unpinned tabs",
    "Tabs you choose",
    "All tabs",
  ]);
  await page.keyboard.press("Escape");
  await after.click();
  await expect(page.getByRole("option")).toHaveText([
    "30 minutes",
    "1 hour",
    "3 hours",
    "6 hours",
  ]);
});

const calendarTab = (shell: Page) =>
  shell
    .getByRole("tablist", { name: "Tabs" })
    .getByRole("tab", { name: CALENDAR_TITLE, exact: true });

/** The Calendar tab's context menu, as its labels. */
const calendarMenu = async (app: ElectronApplication) => {
  const shell = await findPage(app, SHELL_URL);
  const menu = await openContextMenu(app, () =>
    calendarTab(shell).click({ button: "right" })
  );

  return menu.items;
};

test("Tabs you choose brings Sleep When Idle to a tab's menu after Sleep, whose check is written to the tab and kept across a relaunch", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          {
            id: "c",
            app: "calendar",
            url: standIn.calendarUrl,
            title: CALENDAR_TITLE,
          },
        ],
        selectedTabId: "gmail",
      },
    ],
    selectedProfileId: "p",
  });

  const app = await launchApp();

  await findPage(app, standIn.url);
  const unpinned = await calendarMenu(app);

  expect(
    unpinned.filter((item) => item.startsWith(SLEEP_WHEN_IDLE))
  ).toStrictEqual([]);

  const page = await openSettings(app);

  await openTabsApps(page);
  await page.getByRole("combobox", { name: SLEEP_IDLE }).click();
  await page.getByRole("option", { name: "Tabs you choose" }).click();
  await expect
    .poll(async () => {
      const stored = await readStored(userDataDir);

      return stored.sleepIdleTabs;
    })
    .toBe("chosen");

  const chosen = await calendarMenu(app);

  expect(chosen.slice(0, 3)).toStrictEqual([
    "Wake",
    `${SLEEP_WHEN_IDLE} [ ]`,
    "—",
  ]);
  await chooseContextMenuItem(app, SLEEP_WHEN_IDLE);

  const marked = async () => {
    const state = await readState<{
      profiles: { tabs: { id: string; sleepWhenIdle?: unknown }[] }[];
    }>(userDataDir);

    return state.profiles[0]?.tabs.find((each) => each.id === "c")
      ?.sleepWhenIdle;
  };

  await expect.poll(marked).toBe(true);
  await app.close();

  const again = await launchApp();

  await findPage(again, standIn.url);
  expect(await calendarMenu(again)).toContain(`${SLEEP_WHEN_IDLE} [x]`);
});

test("turning the switch off sends Gmail's Calendar link to the default browser and disables the menu saying why, its value kept", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeSettings(userDataDir, { appsInDefaultBrowser: ["drive"] });

  const app = await launchApp();
  const gmail = await findPage(app, standIn.url);

  await stubSystemBrowser(app);

  const page = await openSettings(app);

  await openTabsApps(page);
  await expect(menuButton(page, "Drive")).toBeEnabled();
  await switchNamed(page, IN_MERU).click();

  await expect(switchNamed(page, IN_MERU)).not.toBeChecked();
  await expect(switchNamed(page, IN_MERU)).toHaveAccessibleDescription(
    SWITCHED_OFF
  );
  await expect(menuButton(page, "Drive")).toBeDisabled();
  await expect(menuButton(page, "Drive")).toHaveAccessibleDescription(
    TURN_ON_FIRST
  );
  await expect
    .poll(async () => {
      const stored = await readStored(userDataDir);

      return [stored.openAppsInMeru, stored.appsInDefaultBrowser];
    })
    .toStrictEqual([false, ["drive"]]);

  await gmail.getByRole("link", { name: "Open Calendar" }).click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([standIn.calendarUrl]);
  expect(await viewUrls(app)).toStrictEqual([standIn.url]);

  // Turned back on, the next link opens as a tab with no restart.
  await switchNamed(page, IN_MERU).click();
  await expect(menuButton(page, "Drive")).toBeEnabled();
  await gmail.getByRole("link", { name: "Open Calendar" }).click();
  await expect
    .poll(() => viewUrls(app))
    .toStrictEqual([standIn.url, standIn.calendarUrl]);
  expect(await readOpenedExternally(app)).toStrictEqual([standIn.calendarUrl]);
});

test("excluding Drive sends Gmail's Drive link out while its Calendar link opens a tab, two quick checks both hold, and no open tab closes", async ({
  app,
  standIn,
  userDataDir,
}) => {
  const gmail = await findPage(app, standIn.url);

  await stubSystemBrowser(app);
  await gmail.getByRole("link", { name: "Open Drive" }).click();
  await expect
    .poll(() => viewUrls(app))
    .toStrictEqual([standIn.url, standIn.driveUrl]);

  const page = await openSettings(app);

  await openTabsApps(page);
  await menuButton(page, "None").click();
  await page.getByRole("menuitemcheckbox", { name: "Drive" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Meet" }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Drive" })
  ).toBeChecked();
  await expect(menuButton(page, "Drive, Meet")).toBeVisible();
  await expect
    .poll(async () => {
      const stored = await readStored(userDataDir);

      return stored.appsInDefaultBrowser;
    })
    .toStrictEqual(["drive", "meet"]);
  await page.keyboard.press("Escape");

  await gmail.getByRole("link", { name: "Open Drive" }).click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([standIn.driveUrl]);
  await gmail.getByRole("link", { name: "Open Calendar" }).click();
  // The Drive tab opened before stays.
  await expect
    .poll(() => viewUrls(app))
    .toStrictEqual([standIn.url, standIn.driveUrl, standIn.calendarUrl]);
  expect(await readOpenedExternally(app)).toStrictEqual([standIn.driveUrl]);
});

/** One profile with a pinned Drive tab that opens at launch, not selected. */
const seedPinnedDrive = (userDataDir: string, standIn: StandIn) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          {
            id: "d",
            app: "drive",
            url: standIn.driveUrl,
            title: DRIVE_TITLE,
            pinned: true,
            openAtLaunch: true,
          },
        ],
        selectedTabId: "gmail",
      },
    ],
    selectedProfileId: "p",
  });

test("New tab sends an excluded app to the default browser and closes, while a pinned tab of it still loads at launch", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedPinnedDrive(userDataDir, standIn);
  await writeSettings(userDataDir, { appsInDefaultBrowser: ["drive"] });

  const app = await launchApp();

  await findPage(app, standIn.url);
  await expect
    .poll(() => viewUrls(app))
    .toStrictEqual([standIn.url, standIn.driveUrl]);
  await stubSystemBrowser(app);

  const overlay = await findOverlayDocument(app);
  const launcher = overlay.getByRole("dialog", { name: "New tab" });

  await clickMenuItem(app, "app.open");
  await expect(launcher).toBeVisible();
  await overlay.getByRole("option", { name: "Drive" }).click();

  await expect(launcher).toHaveCount(0);
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([standIn.driveUrl]);
  expect(await viewUrls(app)).toStrictEqual([standIn.url, standIn.driveUrl]);

  await clickMenuItem(app, "app.open");
  await overlay.getByRole("option", { name: "Calendar" }).click();
  await expect
    .poll(() => viewUrls(app))
    .toStrictEqual([standIn.url, standIn.driveUrl, standIn.calendarUrl]);
});

/** Launches with a trial the stand-in remembers as ended, so the run is free. */
const launchFree = async (
  launchApp: (env?: Record<string, string>) => Promise<ElectronApplication>,
  userDataDir: string
) => {
  await writeFile(
    path.join(userDataDir, "entitlement-stub.json"),
    JSON.stringify({ trialStartedAt: Date.now() - 15 * DAY, licenses: {} })
  );

  return launchApp(NO_TRIAL);
};

test("on the free version every row is a Pro row, disabled, its stored value kept and unwritten", async ({
  launchApp,
  userDataDir,
}) => {
  const stored = {
    openAppsInMeru: true,
    appsInDefaultBrowser: ["drive"],
    sleepIdleTabs: "all",
    sleepAfter: "3h",
  };

  await writeSettings(userDataDir, stored);

  const app = await launchFree(launchApp, userDataDir);
  const page = await openSettings(app);

  await openTabsApps(page);

  for (const label of [IN_MERU, IN_BROWSER, SLEEP_IDLE, SLEEP_AFTER]) {
    // oxlint-disable-next-line no-await-in-loop -- one row after another
    await expect(
      page.getByRole("button", { name: `Meru Pro ${label}`, exact: true })
    ).toBeVisible();
  }

  await expect(switchNamed(page, IN_MERU)).toBeDisabled();
  await expect(menuButton(page, "None")).toBeDisabled();
  await expect(page.getByRole("combobox", { name: SLEEP_IDLE })).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: SLEEP_AFTER })
  ).toBeDisabled();
  // The Pro state outranks the reason the switch would give.
  await expect(menuButton(page, "None")).not.toHaveAccessibleDescription(
    TURN_ON_FIRST
  );

  await app.close();

  expect(await readStored(userDataDir)).toMatchObject(stored);
});

const shoot = async (app: ElectronApplication, page: Page, surface: string) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one theme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one after another
    await page.screenshot({ path: shotPath(surface, theme) });
  }
};

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the page on, off and with the menu open, light and dark", async ({
    app,
  }) => {
    const page = await openSettings(app);

    await openTabsApps(page);
    await shoot(app, page, "settings-tabs-apps");

    await menuButton(page, "None").click();
    await page.getByRole("menuitemcheckbox", { name: "Drive" }).click();
    await expect(menuButton(page, "Drive")).toBeVisible();
    await shoot(app, page, "settings-tabs-apps-menu");
    await page.keyboard.press("Escape");

    await switchNamed(page, IN_MERU).click();
    await expect(menuButton(page, "Drive")).toBeDisabled();
    await shoot(app, page, "settings-tabs-apps-off");
  });

  test("the page on the free version, light and dark", async ({
    launchApp,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, { appsInDefaultBrowser: ["drive"] });

    const free = await launchFree(launchApp, userDataDir);
    const freePage = await openSettings(free);

    await openTabsApps(freePage);
    await shoot(free, freePage, "free-settings-tabs-apps");
  });
});
