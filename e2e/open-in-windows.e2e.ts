import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { OWN_WINDOW_FRAME_PREFIX } from "#core/own-window.ts";

import {
  SHELL_URL,
  chooseContextMenuItem,
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  openContextMenu,
  readState,
  readViews,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { findTitlebar, readOwnWindows } from "./lib/own-window.ts";
import {
  gmailOf,
  openSection,
  openSettings,
  scopeTab,
  switchNamed,
} from "./lib/settings.ts";
import { CALENDAR_TITLE, DRIVE_TITLE, STAND_IN_TITLE } from "./lib/stand-in.ts";
import type { StandIn } from "./lib/stand-in.ts";

const OPEN_IN = "Open Google apps in";
const SHOW_WINDOWS = "Show windows in the sidebar";

interface StoredTab {
  id: string;
  app: string;
  ownWindow?: boolean;
}

interface Stored {
  profiles: {
    id: string;
    tabs: StoredTab[];
    selectedTabId: string;
    splits?: unknown[];
  }[];
}

/** Each profile's stored tabs as `app` or `app:window`, its selection and split count. */
const storedTabs = async (userDataDir: string) => {
  const { profiles } = await readState<Stored>(userDataDir);

  return Object.fromEntries(
    profiles.map((profile) => [
      profile.id,
      {
        tabs: profile.tabs.map(
          (tab) => `${tab.app}${tab.ownWindow === true ? ":window" : ""}`
        ),
        selected: profile.selectedTabId,
        splits: profile.splits?.length ?? 0,
      },
    ])
  );
};

/** The page each own window shows. */
const ownWindowPages = async (app: ElectronApplication) => {
  const windows = await readOwnWindows(app);

  return windows.map(
    (window) => window.views.find((view) => view.name === "")?.url
  );
};

/**
 * How many own windows' titlebars Playwright has reported, which must be
 * every one before any of them closes, the app's own quit included.
 */
const titlebarCount = async (app: ElectronApplication) => {
  const blank = app
    .windows()
    .filter((page) => !page.isClosed() && page.url() === "about:blank");
  const names = await Promise.all(
    blank.map((page) => page.evaluate(() => window.name).catch(() => ""))
  );

  return names.filter((name) => name.startsWith(OWN_WINDOW_FRAME_PREFIX))
    .length;
};

/** The URL of each main window view of the profile's session. */
const viewsOf = async (app: ElectronApplication, profileId: string) => {
  const { views } = await readViews(app);

  return views
    .filter((view) => view.partition === `persist:${profileId}`)
    .map((view) => view.url);
};

const sidebarTab = (shell: Page, name: string) =>
  shell
    .getByRole("tablist", { name: "Tabs" })
    .getByRole("tab", { name, exact: true });

const selectProfile = async (shell: Page, name: string) => {
  const button = shell
    .getByRole("banner", { name: "Title bar" })
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: new RegExp(`^${name}`, "u") });

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
};

/** Picks the app in New tab, or in Open in split with `split`. */
const pickInLauncher = async (
  app: ElectronApplication,
  name: string,
  split = false
) => {
  const overlay = await findOverlayDocument(app);
  const card = overlay.getByRole("dialog", {
    name: split ? "Open in split" : "New tab",
  });

  await clickMenuItem(app, split ? "tab.splitRight" : "app.open");
  await expect(card).toBeVisible();
  await card.getByRole("option", { name, exact: true }).click();
  await expect(card).toHaveCount(0);
};

/**
 * Home, selected, with Gmail and Calendar pinned and opened at launch, and
 * Work with Gmail alone.
 */
const seed = (userDataDir: string, standIn: StandIn) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "home",
        name: "Home",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          {
            id: "c",
            app: "calendar",
            url: standIn.calendarUrl,
            title: "",
            pinned: true,
            openAtLaunch: true,
          },
        ],
        selectedTabId: "gmail",
      },
      {
        id: "work",
        name: "Work",
        tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
        selectedTabId: "gmail",
      },
    ],
    selectedProfileId: "home",
  });

test("under New window for one profile, its Gmail's Drive link and New tab's Drive each open in a window of their own, while Open in split, a pinned app and Gmail stay, and the other profile's open as tabs; changing the setting either way moves nothing", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);
  await writeSettings(userDataDir, {
    profiles: { home: { openAppsIn: "windows" } },
  });

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);
  const home = await gmailOf(app, standIn, "home");

  // Restored and pinned tabs, Gmail's included, open where they were.
  await findPage(app, standIn.calendarUrl);
  expect(await readOwnWindows(app)).toStrictEqual([]);

  await home.getByRole("link", { name: "Open Drive" }).click();
  await expect
    .poll(() => ownWindowPages(app))
    .toStrictEqual([standIn.driveUrl]);
  await findTitlebar(app);
  await expect(sidebarTab(shell, DRIVE_TITLE)).toHaveAccessibleDescription(
    `${DRIVE_TITLE} · in its own window`
  );

  // The main window keeps its selection; a click on Calendar takes the keys
  // back from the new window, so the menu acts on the main window again.
  await sidebarTab(shell, CALENDAR_TITLE).click();
  await expect(sidebarTab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await pickInLauncher(app, "Drive");
  await expect
    .poll(() => ownWindowPages(app))
    .toStrictEqual([standIn.driveUrl, standIn.driveUrl]);
  await expect.poll(() => titlebarCount(app)).toBe(2);

  await sidebarTab(shell, STAND_IN_TITLE).click();
  await expect(sidebarTab(shell, STAND_IN_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await pickInLauncher(app, "Drive", true);
  await expect
    .poll(() => storedTabs(userDataDir))
    .toMatchObject({
      home: {
        tabs: ["gmail", "calendar", "drive:window", "drive:window", "drive"],
        splits: 1,
      },
    });
  expect(await readOwnWindows(app)).toHaveLength(2);
  await expect
    .poll(() => viewsOf(app, "home"))
    .toStrictEqual([standIn.url, standIn.calendarUrl, standIn.driveUrl]);

  await selectProfile(shell, "Work");

  const work = await gmailOf(app, standIn, "work");

  await work.getByRole("link", { name: "Open Drive" }).click();
  await expect
    .poll(() => viewsOf(app, "work"))
    .toStrictEqual([standIn.url, standIn.driveUrl]);
  await pickInLauncher(app, "Drive");
  await expect
    .poll(() => viewsOf(app, "work"))
    .toStrictEqual([standIn.url, standIn.driveUrl, standIn.driveUrl]);
  expect(await readOwnWindows(app)).toHaveLength(2);

  // Every profile to New window and Home back to Tabs: nothing moves.
  const before = await storedTabs(userDataDir);
  const page = await openSettings(app);

  await openSection(page, "Tabs & Google Apps");
  await page.getByRole("combobox", { name: OPEN_IN }).click();
  await page.getByRole("option", { name: "New window" }).click();
  await expect(page.getByRole("combobox", { name: OPEN_IN })).toContainText(
    "New window"
  );
  await scopeTab(page, "Home").click();
  await page.getByRole("combobox", { name: OPEN_IN }).click();
  await page.getByRole("option", { name: "Tabs" }).click();
  await expect(
    page.getByText("Set for Home only. For all profiles, it's New window.")
  ).toBeVisible();
  await expect
    .poll(async () => {
      const stored = JSON.parse(
        await readFile(path.join(userDataDir, "settings.json"), "utf-8")
      ) as { openAppsIn?: unknown; profiles?: unknown };

      return [stored.openAppsIn, stored.profiles];
    })
    .toStrictEqual(["windows", { home: { openAppsIn: "tabs" } }]);
  expect(await storedTabs(userDataDir)).toStrictEqual(before);
  expect(await readOwnWindows(app)).toHaveLength(2);
  expect(await viewsOf(app, "work")).toHaveLength(3);
});

test("with Show windows in the sidebar off, a tab in its own window leaves the sidebar and comes back as the switch turns on, with its mark, and on Move to Main Window", async ({
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
            title: "",
            ownWindow: true,
          },
          { id: "d", app: "drive", url: standIn.driveUrl, title: "" },
        ],
        selectedTabId: "d",
      },
    ],
    selectedProfileId: "p",
  });
  await writeSettings(userDataDir, { showWindowsInSidebar: false });

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);
  const titlebar = await findTitlebar(app);
  const calendar = sidebarTab(shell, CALENDAR_TITLE);

  await expect(sidebarTab(shell, DRIVE_TITLE)).toBeVisible();
  await expect(calendar).toHaveCount(0);

  const page = await openSettings(app);

  await openSection(page, "Tabs & Google Apps");
  await switchNamed(page, SHOW_WINDOWS).click();
  await expect(calendar).toHaveAccessibleDescription(
    `${CALENDAR_TITLE} · in its own window`
  );
  await switchNamed(page, SHOW_WINDOWS).click();
  await expect(calendar).toHaveCount(0);

  const more = titlebar
    .getByRole("banner", { name: "Title bar" })
    .getByRole("button", { name: "More options" });

  await openContextMenu(app, () => more.click());
  await chooseContextMenuItem(app, "Move to Main Window");
  await expect(calendar).toHaveAttribute("aria-selected", "true");
  await expect(calendar).not.toHaveAccessibleDescription(/own window/u);
});
