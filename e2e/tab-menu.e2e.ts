import type { ElectronApplication, Page } from "@playwright/test";

import {
  chooseContextMenuItem,
  expect,
  expectKeyMadeMenuDropped,
  findPage,
  openContextMenu,
  readOpenedExternally,
  readState,
  stubSystemBrowser,
  test,
  writeState,
} from "./lib/app.ts";
import { ACCELERATORS } from "./lib/keys.ts";
import { findTitlebar } from "./lib/own-window.ts";
import type { StandIn } from "./lib/stand-in.ts";
import { CALENDAR_TITLE, DRIVE_TITLE, STAND_IN_TITLE } from "./lib/stand-in.ts";

/** Gmail, pinned, then Calendar and Drive, with Calendar selected. */
const seed = (userDataDir: string, standIn: StandIn) =>
  writeState(userDataDir, {
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
          { id: "d", app: "drive", url: standIn.driveUrl, title: DRIVE_TITLE },
        ],
        selectedTabId: "c",
      },
    ],
    selectedProfileId: "p",
  });

const tabs = (shell: Page) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab");

const tab = (shell: Page, title: string) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab", {
    name: title,
    exact: true,
  });

/** Launches on the seed, with Calendar's and Gmail's pages loaded. */
const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn
) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.calendarUrl);
  await findPage(app, standIn.url);

  return { app, shell };
};

/** Right-clicks the tab and gives the native menu it pops up. */
const openMenu = (app: ElectronApplication, shell: Page, title: string) =>
  openContextMenu(app, () => tab(shell, title).click({ button: "right" }));

/** The items of the menu the tab's right-click pops up. */
const menuItems = async (
  app: ElectronApplication,
  shell: Page,
  title: string
) => {
  const { items } = await openMenu(app, shell, title);

  return items;
};

/** Pops up the tab's menu and chooses the item. */
const choose = async (
  app: ElectronApplication,
  shell: Page,
  title: string,
  label: string
) => {
  await openMenu(app, shell, title);
  await chooseContextMenuItem(app, label);
};

const readTabs = async (userDataDir: string) => {
  const { profiles } = await readState<{
    profiles: {
      tabs: {
        id: string;
        url: string;
        pinned?: boolean;
        openAtLaunch?: boolean;
        ownWindow?: boolean;
      }[];
      selectedTabId: string;
    }[];
  }>(userDataDir);

  return profiles[0];
};

/** The state file's tab at `index`, as written. */
const storedTab = async (userDataDir: string, index: number) => {
  const profile = await readTabs(userDataDir);

  return profile?.tabs[index];
};

const storedIds = async (userDataDir: string) => {
  const profile = await readTabs(userDataDir);

  return profile?.tabs.map((each) => each.id);
};

const readClipboard = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "meruTestClipboard") as string[]);

/** Whether the window with this id is the main window, not a tab's own. */
const isMainWindow = (app: ElectronApplication, id: number) =>
  app.evaluate(
    ({ BrowserWindow }, windowId) =>
      BrowserWindow.getAllWindows().some((window) => window.id === windowId),
    id
  );

test("a right-click on a tab pops up its native menu at the pointer in the main window, its items for the tab with their shortcuts", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const box = await tab(shell, CALENDAR_TITLE).boundingBox();
  const calendar = await openContextMenu(app, () =>
    tab(shell, CALENDAR_TITLE).click({
      button: "right",
      position: { x: 10, y: 8 },
    })
  );

  // Where the click landed, which Chromium takes to the whole pixel.
  expect(
    Math.abs((calendar.at?.x ?? 0) - (box?.x ?? 0) - 10) +
      Math.abs((calendar.at?.y ?? 0) - (box?.y ?? 0) - 8)
  ).toBeLessThanOrEqual(2);
  expect(await isMainWindow(app, calendar.windowId)).toBe(true);
  expect(calendar.items).toStrictEqual([
    "Sleep",
    "—",
    `Reload ${ACCELERATORS.reload}`,
    "Duplicate",
    "Copy URL",
    "Open in Default Browser",
    "—",
    "Pin",
    `Bookmark Tab ${ACCELERATORS.bookmark}`,
    "—",
    `Split Right ${ACCELERATORS.splitRight}`,
    `Split Down ${ACCELERATORS.splitDown}`,
    `Maximize Pane (off) ${ACCELERATORS.maximize}`,
    "Separate from Split (off)",
    "—",
    "Move to New Window CommandOrControl+Shift+N",
    "—",
    "Close Tab CommandOrControl+Shift+W",
    "Close Other Tabs",
    "Close Tabs Below",
  ]);

  // Drive has no page yet, and Gmail is pinned and cannot be bookmarked.
  const drive = await openContextMenu(app, () =>
    tab(shell, DRIVE_TITLE).click({ button: "right" })
  );
  const gmail = await openContextMenu(app, () =>
    tab(shell, STAND_IN_TITLE).click({ button: "right" })
  );

  expect([drive.items.slice(0, 2), drive.items.slice(6, 8)]).toStrictEqual([
    ["Wake", "—"],
    ["—", "Pin"],
  ]);
  expect(gmail.items.slice(6, 10)).toStrictEqual([
    "—",
    "Unpin",
    "Open at Launch [x]",
    "—",
  ]);
  expect(gmail.items.slice(-3)).toStrictEqual([
    "—",
    "Close Other Tabs",
    "Close Tabs Below",
  ]);
});

test("Shift+F10 and the Menu key on a focused tab pop its menu up beside it, and focus stays on the tab", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const drive = tab(shell, DRIVE_TITLE);

  await drive.focus();

  const shifted = await openContextMenu(app, () => drive.press("Shift+F10"));
  const tile = await drive.boundingBox();

  expect(shifted.at).toStrictEqual({
    x: Math.round((tile?.x ?? 0) + (tile?.width ?? 0)),
    y: Math.round(tile?.y ?? 0),
  });
  await expect(drive).toBeFocused();

  const keyed = await openContextMenu(app, () => drive.press("ContextMenu"));

  expect(keyed.items[0]).toBe("Wake");
  await expect(drive).toBeFocused();
  await expectKeyMadeMenuDropped(app, drive);
});

test("Reload, Copy URL and Open in default browser act on the menu's tab and select nothing", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const gmail = await findPage(app, standIn.url);

  await stubSystemBrowser(app);
  await gmail.evaluate(() => {
    Reflect.set(window, "meruBeforeReload", true);
  });

  await choose(app, shell, STAND_IN_TITLE, "Reload");
  await expect
    .poll(() =>
      gmail
        .evaluate(() => Reflect.get(window, "meruBeforeReload") === true)
        // The page going as it reloads.
        .catch(() => true)
    )
    .toBe(false);

  await choose(app, shell, DRIVE_TITLE, "Copy URL");
  await choose(app, shell, DRIVE_TITLE, "Open in Default Browser");

  await expect
    .poll(async () => [
      await readClipboard(app),
      await readOpenedExternally(app),
    ])
    .toStrictEqual([[standIn.driveUrl], [standIn.driveUrl]]);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

test("Duplicate opens the tab's page again right after it, selected", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);

  await choose(app, shell, CALENDAR_TITLE, "Duplicate");
  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    CALENDAR_TITLE,
    CALENDAR_TITLE,
    DRIVE_TITLE,
  ]);
  await expect(tabs(shell).nth(2)).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(async () => {
      const copy = await storedTab(userDataDir, 2);

      return copy?.url;
    })
    .toBe(standIn.calendarUrl);
});

test("Pin, Open at Launch and Unpin, then Close tab, Close other tabs and Close tabs below, which leave pinned tabs", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);

  await choose(app, shell, DRIVE_TITLE, "Pin");
  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    DRIVE_TITLE,
    CALENDAR_TITLE,
  ]);

  const pinned = await openMenu(app, shell, DRIVE_TITLE);

  expect(pinned.items).toContain("Open at Launch [ ]");
  expect(pinned.items).not.toContain("Close Tab CommandOrControl+Shift+W");
  await chooseContextMenuItem(app, "Open at Launch");
  await expect
    .poll(async () => {
      const drive = await storedTab(userDataDir, 2);

      return drive?.openAtLaunch;
    })
    .toBe(true);
  await expect
    .poll(() => menuItems(app, shell, DRIVE_TITLE))
    .toContain("Open at Launch [x]");

  await choose(app, shell, DRIVE_TITLE, "Unpin");
  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    CALENDAR_TITLE,
    DRIVE_TITLE,
  ]);

  await choose(app, shell, DRIVE_TITLE, "Close Tab");
  await expect(tabs(shell)).toHaveText([STAND_IN_TITLE, CALENDAR_TITLE]);

  await choose(app, shell, CALENDAR_TITLE, "Duplicate");
  await expect(tabs(shell)).toHaveCount(3);
  await choose(app, shell, STAND_IN_TITLE, "Close Tabs Below");
  await expect(tabs(shell)).toHaveCount(0);
  await expect.poll(() => storedIds(userDataDir)).toStrictEqual(["gmail"]);
});

test("Close Other Tabs keeps the menu's tab and the pinned ones, and selects it where the selected one closed", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);

  await choose(app, shell, DRIVE_TITLE, "Close Other Tabs");
  await expect(tabs(shell)).toHaveText([STAND_IN_TITLE, DRIVE_TITLE]);
  await expect(tab(shell, DRIVE_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

test("Bookmark Tab bookmarks the menu's page, which the next menu offers to remove", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);

  await choose(app, shell, CALENDAR_TITLE, "Bookmark Tab");
  await expect
    .poll(() => menuItems(app, shell, CALENDAR_TITLE))
    .toContain(`Remove Bookmark ${ACCELERATORS.bookmark}`);
  await chooseContextMenuItem(app, "Remove Bookmark");
  await expect
    .poll(() => menuItems(app, shell, CALENDAR_TITLE))
    .toContain(`Bookmark Tab ${ACCELERATORS.bookmark}`);
});

test("Move to New Window, then the own window's tab in the sidebar and its More options offer Move to main window, which puts it back", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);

  await choose(app, shell, CALENDAR_TITLE, "Move to New Window");

  const titlebar = await findTitlebar(app);
  const more = titlebar
    .getByRole("banner", { name: "Title bar" })
    .getByRole("button", { name: "More options" });
  const sidebar = await openMenu(app, shell, CALENDAR_TITLE);

  expect(sidebar.items).toContain(
    "Move to Main Window CommandOrControl+Shift+M"
  );
  expect(sidebar.items).not.toContain("Sleep");

  const box = await more.boundingBox();
  const options = await openContextMenu(app, () => more.click());

  expect(await isMainWindow(app, options.windowId)).toBe(false);
  expect(options.at).toStrictEqual({
    x: Math.round(box?.x ?? 0),
    y: Math.round((box?.y ?? 0) + (box?.height ?? 0)),
  });
  expect(options.items).toStrictEqual([
    "Move to Main Window CommandOrControl+Shift+M",
    "Copy URL",
    "Open in Default Browser",
  ]);

  await chooseContextMenuItem(app, "Copy URL");
  await expect
    .poll(() => readClipboard(app))
    .toStrictEqual([standIn.calendarUrl]);
  await openContextMenu(app, () => more.click());
  await chooseContextMenuItem(app, "Move to Main Window");
  await expect
    .poll(async () => {
      const calendar = await storedTab(userDataDir, 1);

      return calendar?.ownWindow ?? false;
    })
    .toBe(false);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
});
