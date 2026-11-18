import type { ElectronApplication, Page } from "@playwright/test";

import {
  expect,
  findOverlayDocument,
  findPage,
  readOpenedExternally,
  readState,
  stubSystemBrowser,
  test,
  writeState,
} from "./lib/app.ts";
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

/** Right-clicks the tab and gives the menu that opens, in the overlay's document. */
const openMenu = async (
  app: ElectronApplication,
  shell: Page,
  title: string
) => {
  await tab(shell, title).click({ button: "right" });

  const overlay = await findOverlayDocument(app);
  const menu = overlay.getByRole("menu", { name: title });

  await expect(menu).toBeVisible();

  return { overlay, menu };
};

/** An item by its label, which its shortcut follows in its name. */
const item = (overlay: Page, label: string) =>
  overlay.getByRole("menuitem", {
    name: new RegExp(`^${label}(?:$| [^a-z])`, "u"),
  });

/** Opens the tab's menu and chooses the item. */
const choose = async (
  app: ElectronApplication,
  shell: Page,
  title: string,
  label: string
) => {
  const { overlay, menu } = await openMenu(app, shell, title);

  await item(overlay, label).click();
  await expect(menu).toHaveCount(0);
};

const readTabs = async (userDataDir: string) => {
  const { profiles } = await readState<{
    profiles: {
      tabs: {
        id: string;
        url: string;
        pinned?: boolean;
        openAtLaunch?: boolean;
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

test("a right-click on a tab opens its menu reaching over the sidebar, where the arrows, typeahead and Escape work, and focus goes back to the tab", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const { overlay, menu } = await openMenu(app, shell, DRIVE_TITLE);
  const sidebar = await shell
    .getByRole("tablist", { name: "Tabs" })
    .boundingBox();
  const box = await menu.boundingBox();

  expect(
    (box?.x ?? 0) < (sidebar?.x ?? 0) + (sidebar?.width ?? 0) &&
      (box?.x ?? 0) + (box?.width ?? 0) >
        (sidebar?.x ?? 0) + (sidebar?.width ?? 0)
  ).toBeTruthy();

  await overlay.keyboard.press("ArrowDown");
  await expect(item(overlay, "Reload")).toBeFocused();
  await overlay.keyboard.press("c");
  await expect(
    overlay.getByRole("menuitem", { name: "Copy URL" })
  ).toBeFocused();
  await overlay.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(tab(shell, DRIVE_TITLE)).toBeFocused();
});

test("Shift+F10 and the Menu key on a focused tab open its menu beside it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const drive = tab(shell, DRIVE_TITLE);

  await drive.focus();
  await drive.press("Shift+F10");

  const overlay = await findOverlayDocument(app);
  const menu = overlay.getByRole("menu", { name: DRIVE_TITLE });
  const box = await menu.boundingBox();
  const tile = await drive.boundingBox();

  await expect(menu).toBeVisible();
  // At the tile's right edge, to the pixel the point is rounded to.
  expect(
    Math.abs((box?.x ?? 0) - (tile?.x ?? 0) - (tile?.width ?? 0))
  ).toBeLessThan(2);

  await overlay.keyboard.press("Escape");
  await expect(drive).toBeFocused();
  await drive.press("ContextMenu");
  await expect(menu).toBeVisible();
});

test("a click beside the menu closes it and reaches nothing under the pointer", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);
  const gmail = await tab(shell, STAND_IN_TITLE).boundingBox();
  const { overlay, menu } = await openMenu(app, shell, DRIVE_TITLE);

  await overlay.mouse.click(
    (gmail?.x ?? 0) + (gmail?.width ?? 0) / 2,
    (gmail?.y ?? 0) + (gmail?.height ?? 0) / 2
  );
  await expect(menu).toHaveCount(0);
  await expect(tab(shell, CALENDAR_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
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
      gmail.evaluate(() => Reflect.get(window, "meruBeforeReload") === true)
    )
    .toBe(false);

  await choose(app, shell, DRIVE_TITLE, "Copy URL");
  await choose(app, shell, DRIVE_TITLE, "Open in default browser");

  expect([
    await readClipboard(app),
    await readOpenedExternally(app),
  ]).toStrictEqual([[standIn.driveUrl], [standIn.driveUrl]]);
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

  const { overlay } = await openMenu(app, shell, DRIVE_TITLE);
  const launches = overlay.getByRole("menuitemcheckbox", {
    name: "Open at Launch",
  });

  await expect(launches).not.toBeChecked();
  await expect(item(overlay, "Close tab")).toHaveCount(0);
  await launches.click();
  await expect
    .poll(async () => {
      const drive = await storedTab(userDataDir, 2);

      return drive?.openAtLaunch;
    })
    .toBe(true);

  await choose(app, shell, DRIVE_TITLE, "Unpin");
  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    CALENDAR_TITLE,
    DRIVE_TITLE,
  ]);

  await choose(app, shell, DRIVE_TITLE, "Close tab");
  await expect(tabs(shell)).toHaveText([STAND_IN_TITLE, CALENDAR_TITLE]);

  await choose(app, shell, CALENDAR_TITLE, "Duplicate");
  await expect(tabs(shell)).toHaveCount(3);
  await choose(app, shell, STAND_IN_TITLE, "Close tabs below");
  await expect(tabs(shell)).toHaveCount(0);
  await expect.poll(() => storedIds(userDataDir)).toStrictEqual(["gmail"]);
});

test("Close other tabs keeps the menu's tab and the pinned ones, and selects it where the selected one closed", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, standIn);

  await choose(app, shell, DRIVE_TITLE, "Close other tabs");
  await expect(tabs(shell)).toHaveText([STAND_IN_TITLE, DRIVE_TITLE]);
  await expect(tab(shell, DRIVE_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
});
