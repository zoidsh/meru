// The free version's main window is Gmail alone: no other tab, split or
// bookmark is shown, loaded or opened, and every one stays stored for a
// license to bring back while Meru runs. Each entitlement is reached through
// its stored file and the stand-in server the suite's build holds in place of
// the entitlement API.
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { DAY } from "#core/entitlement.ts";

import {
  NO_TRIAL,
  SHELL_URL,
  expect,
  findPage,
  readOpenedExternally,
  readState,
  readViews,
  stubSystemBrowser,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { openSection, openSettings, switchNamed } from "./lib/settings.ts";
import {
  THEMES,
  emulateTheme,
  onlyWithShots,
  shootWindow,
  shotPath,
} from "./lib/shots.ts";
import type { StandIn } from "./lib/stand-in.ts";

const KEY = "MERU-TEST-AAAA-BBBB-CCCC-7Q2K";

const isMacOS = process.platform === "darwin";
const command = isMacOS ? ("meta" as const) : ("control" as const);

interface StoredProfile {
  tabs: { id: string; pinned?: boolean }[];
  selectedTabId: string;
  splits?: unknown[];
  bookmarks?: unknown[];
}

/**
 * One profile as a trial left it: Gmail and Calendar pinned, two Drive tabs
 * in a split, the first selected, and a bookmark.
 */
const seed = async (userDataDir: string, standIn: StandIn) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Personal",
        tabs: [
          {
            id: "gmail",
            app: "gmail",
            url: standIn.url,
            title: "",
            pinned: true,
            openAtLaunch: true,
          },
          {
            id: "cal",
            app: "calendar",
            url: standIn.calendarUrl,
            title: "Calendar",
            pinned: true,
          },
          { id: "d1", app: "drive", url: standIn.driveUrl, title: "Drive" },
          {
            id: "d2",
            app: "drive",
            url: `${standIn.driveUrl}?second`,
            title: "Drive 2",
          },
        ],
        selectedTabId: "d1",
        splits: [
          {
            root: {
              direction: "row",
              children: [
                { size: 0.5, pane: "d1" },
                { size: 0.5, pane: "d2" },
              ],
            },
          },
        ],
        bookmarks: [
          { id: "b", url: standIn.driveUrl, title: "Drive", app: "drive" },
        ],
      },
    ],
    selectedProfileId: "p",
  });
  await writeSettings(userDataDir, { titlebarNewTab: true });
};

/** What the free version must keep of the seed, as `state.json` holds it. */
const kept = async (userDataDir: string) => {
  const {
    profiles: [profile],
  } = await readState<{ profiles: StoredProfile[] }>(userDataDir);

  return {
    tabs: profile?.tabs.map(({ id, pinned }) => [id, pinned ?? false]),
    selectedTabId: profile?.selectedTabId,
    splits: profile?.splits?.length,
    bookmarks: profile?.bookmarks?.length,
  };
};

const SEEDED = {
  tabs: [
    ["gmail", true],
    ["cal", true],
    ["d1", false],
    ["d2", false],
  ],
  selectedTabId: "d1",
  splits: 1,
  bookmarks: 1,
};

const snapshot = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestEntitlement") as {
        snapshot: () => { status: string };
      }
    ).snapshot()
  );

/** Launches with a trial the stand-in remembers as ended, so the run is free. */
const launchFree = async (
  launchApp: (env?: Record<string, string>) => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn
) => {
  await writeFile(
    path.join(userDataDir, "entitlement-stub.json"),
    JSON.stringify({ trialStartedAt: Date.now() - 15 * DAY, licenses: {} })
  );

  const app = await launchApp(NO_TRIAL);
  const shell = await findPage(app, SHELL_URL);

  await expect
    .poll(() => snapshot(app))
    .toMatchObject({ status: "trialEnded" });

  const gmail = await findPage(app, standIn.url);

  return { app, shell, gmail };
};

const menuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);

    return item ? { label: item.label, enabled: item.enabled } : undefined;
  }, id);

/** Each item the free version keeps in the menu, disabled and saying Pro. */
const PRO_ITEMS = [
  ["sidebar.toggle", "Sidebar"],
  ["app.open", "New Tab…"],
  ["tab.bookmark", "Bookmark Tab"],
  ["tab.next", "Select Next Tab"],
  ["tab.previous", "Select Previous Tab"],
  ["tab.splitRight", "Split Right"],
  ["tab.splitDown", "Split Down"],
  ["tab.maximize", "Maximize Pane"],
  ["tab.separate", "Separate from Split"],
  ["tab.moveToNewWindow", "Move to New Window"],
  ["tab.moveToMainWindow", "Move to Main Window"],
  ["tab.pin", "Unpin Tab"],
  ["tab.openAtLaunch", "Open at Launch"],
  ["tab.close", "Close Tab"],
] as const;

const menuItems = (app: ElectronApplication) =>
  Promise.all(PRO_ITEMS.map(([id]) => menuItem(app, id)));

/** A shortcut pressed in the page at `url`, as the system hands keys to it. */
const press = (
  app: ElectronApplication,
  url: string,
  keyCode: string,
  modifiers: ("meta" | "control" | "alt" | "shift")[]
) =>
  app.evaluate(
    ({ webContents }, request) => {
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(request.url));

      for (const type of ["keyDown", "keyUp"] as const) {
        page?.sendInputEvent({
          type,
          keyCode: request.keyCode,
          modifiers: request.modifiers,
        });
      }
    },
    { url, keyCode, modifiers }
  );

/** Calls the shell's contract as its page would, trusted with nothing. */
const callShell = (shell: Page, name: string, request: unknown) =>
  shell.evaluate(
    async ([call, body]) => {
      const bridge = Reflect.get(window, "meru") as {
        calls: Record<string, (request: unknown) => Promise<unknown>>;
      };

      await bridge.calls[call as string]?.(body);
    },
    [name, request] as const
  );

const titlebar = (shell: Page) =>
  shell.getByRole("banner", { name: "Title bar" });

const titlebarButton = (shell: Page, name: string) =>
  titlebar(shell).getByRole("button", { name, exact: true });

const tabs = (shell: Page) => shell.getByRole("tablist", { name: "Tabs" });

const viewUrls = async (app: ElectronApplication) => {
  const { views } = await readViews(app);

  return views.map(({ url }) => url);
};

test("the free version shows Gmail alone, with no sidebar, New tab or Sidebar button, loads no other tab and marks every tab, split and bookmark item Pro", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const { app, shell } = await launchFree(launchApp, userDataDir, standIn);

  await expect.poll(() => viewUrls(app)).toStrictEqual([standIn.url]);
  await expect(tabs(shell)).toHaveCount(0);
  await expect(titlebarButton(shell, "Sidebar")).toHaveCount(0);
  await expect(titlebarButton(shell, "New tab")).toHaveCount(0);
  await expect
    .poll(() => menuItems(app))
    .toStrictEqual(
      PRO_ITEMS.map(([, label]) => ({
        label: `${label} (Pro)`,
        enabled: false,
      }))
    );
  await expect(menuItem(app, "tab.pinned.1")).resolves.toBeUndefined();

  const { views, area } = await readViews(app);

  // The page area takes the sidebar's width: the view starts at the inset.
  expect(views[0]?.bounds.x).toBeLessThan(16);
  expect(views[0]?.bounds.width).toBeGreaterThan(area.width - 32);
  expect(standIn.requests()).toMatchObject({ calendar: 0, drive: 0 });
});

test("the free version refuses each way to open, move, split or bookmark a tab, and a link to another Google app leaves for the default browser", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const { app, shell, gmail } = await launchFree(
    launchApp,
    userDataDir,
    standIn
  );

  await stubSystemBrowser(app);

  for (const [keyCode, modifiers] of [
    ["T", [command]],
    ["Tab", ["control"]],
    ["N", [command, "alt"]],
    ["D", [command]],
    ["N", [command, "shift"]],
    ["W", [command, "shift"]],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await press(app, standIn.url, keyCode, [...modifiers]);
  }

  const gmailKey = { profileId: "p", tabId: "gmail" };

  for (const [name, request] of [
    ["toggleOpenApp", {}],
    ["toggleSidebar", {}],
    ["openApp", { appId: "calendar" }],
    ["toggleTabBookmark", gmailKey],
    ["closeTab", gmailKey],
    ["maximizePane", { ...gmailKey, on: true }],
    ["dropTab", { ...gmailKey, x: 900, y: 300 }],
    ["splitOntoTab", { ...gmailKey, target: "d1" }],
    ["moveTab", { ...gmailKey, before: "cal" }],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one call after another
    await callShell(shell, name, request);
  }

  await gmail.getByRole("link", { name: "Open Calendar" }).click();
  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([standIn.calendarUrl]);

  expect(await viewUrls(app)).toStrictEqual([standIn.url]);
  await expect(tabs(shell)).toHaveCount(0);
  await expect(
    shell.getByRole("dialog", { name: "Open Google app or bookmark" })
  ).toHaveCount(0);
  expect(standIn.requests()).toMatchObject({ calendar: 0, drive: 0 });

  await app.close();

  await expect(kept(userDataDir)).resolves.toStrictEqual(SEEDED);
});

test("New tab's title bar switch is a Pro row on the free version, its value kept, and a license brings back the sidebar, the tabs, the split and the bookmark at once", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seed(userDataDir, standIn);

  const { app, shell } = await launchFree(launchApp, userDataDir, standIn);
  const page = await openSettings(app);

  await openSection(page, "Appearance");
  await expect(switchNamed(page, "New tab")).toBeDisabled();
  await expect(switchNamed(page, "New tab")).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Meru Pro New tab", exact: true })
  ).toBeVisible();

  await openSection(page, "Meru Pro");
  await page.getByRole("button", { name: "Enter license key…" }).click();
  await page.getByRole("textbox", { name: "License key" }).fill(KEY);
  await page.getByRole("button", { name: "Activate" }).click();
  await expect(
    page.getByRole("button", { name: "Change license key" })
  ).toBeVisible();

  await expect(tabs(shell).getByRole("tab")).toHaveCount(4);
  await expect(titlebarButton(shell, "Sidebar")).toBeVisible();
  await expect(menuItem(app, "app.open")).resolves.toStrictEqual({
    label: "New Tab…",
    enabled: true,
  });
  await expect(menuItem(app, "tab.maximize")).resolves.toMatchObject({
    label: "Maximize Pane",
  });
  await expect
    .poll(async () => {
      const urls = await viewUrls(app);

      return urls.toSorted();
    })
    .toStrictEqual(
      [standIn.url, standIn.driveUrl, `${standIn.driveUrl}?second`].toSorted()
    );
  await expect(kept(userDataDir)).resolves.toStrictEqual(SEEDED);

  await openSection(page, "Appearance");
  await expect(switchNamed(page, "New tab")).toBeChecked();
  await expect(switchNamed(page, "New tab")).toBeEnabled();
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the free version's main window, Gmail alone, light and dark", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    await seed(userDataDir, standIn);

    const { app, shell } = await launchFree(launchApp, userDataDir, standIn);

    await expect.poll(() => viewUrls(app)).toStrictEqual([standIn.url]);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await shootWindow(app, shell, shotPath("free-main-window", theme));
    }
  });
});
