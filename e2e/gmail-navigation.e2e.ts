import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import {
  clickMenuItem,
  expect,
  findPage,
  readState,
  readViews,
  test,
  writeState,
} from "./lib/app.ts";

const menuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);

    return item && { enabled: item.enabled, label: item.label };
  }, id);

/** The ids of the menu's items that run a saved search, in order. */
const savedSearchItems = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => {
    const ids: string[] = [];
    const walk = (menu: Electron.Menu | null | undefined) => {
      for (const item of menu?.items ?? []) {
        // An item made without an id has none.
        if ((item.id as string | undefined)?.startsWith("savedSearch.open.")) {
          ids.push(item.id);
        }

        walk(item.submenu);
      }
    };

    walk(Menu.getApplicationMenu());

    return ids;
  });

/** The first profile's saved searches as the file holds them. */
const readSaved = async (userDataDir: string) => {
  const { profiles } = await readState<{
    profiles: { savedSearches?: unknown }[];
  }>(userDataDir);

  return profiles[0]?.savedSearches;
};

const outline = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).outlineColor);

/** Marks the page's document, so a reload, which makes a new one, shows. */
const markDocument = (view: Page) =>
  view.evaluate(() => {
    Reflect.set(window, "meruTestMark", true);
  });

const isSameDocument = (view: Page) =>
  view.evaluate(() => Reflect.get(window, "meruTestMark") === true);

const hashOf = (view: Page) => view.evaluate(() => location.hash);

test("Compose and Gmail Settings move the open page by its hash, never loading it again", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await markDocument(view);
  await clickMenuItem(app, "gmail.settings");
  await expect.poll(() => hashOf(view)).toBe("#settings");

  await clickMenuItem(app, "gmail.compose");
  await expect.poll(() => hashOf(view)).toBe("#compose");
  expect(await isSameDocument(view)).toBeTruthy();
  expect(await menuItem(app, "gmail.settings")).toStrictEqual({
    enabled: true,
    label: "Gmail Settings",
  });
});

test("Gmail Settings shows Gmail's tab from another tab, loading Gmail at its settings when it had no page yet", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          {
            id: "c1",
            app: "calendar",
            url: standIn.calendarUrl,
            title: "Week",
          },
        ],
        selectedTabId: "c1",
      },
    ],
    selectedProfileId: "p",
  });

  const app = await launchApp();

  await findPage(app, standIn.calendarUrl);
  await clickMenuItem(app, "gmail.settings");

  const view = await findPage(app, standIn.url);

  await expect.poll(() => hashOf(view)).toBe("#settings");
  await expect
    .poll(async () => {
      const { views } = await readViews(app);

      return views
        .filter((candidate) => candidate.visible)
        .map((candidate) => candidate.url);
    })
    .toStrictEqual([`${standIn.url}#settings`]);
});

test("saves the search Gmail shows, quote and all, runs it from the menu exactly, and removes it", async ({
  app,
  standIn,
  userDataDir,
}) => {
  const view = await findPage(app, standIn.url);

  expect(await menuItem(app, "savedSearch.save")).toMatchObject({
    enabled: false,
  });

  // Spelled as Gmail spells its own search's hash.
  await view.evaluate(() => {
    location.hash = "#search/subject%3A%22out+of+office%22+%26+c%2B%2B";
  });
  await expect
    .poll(() => menuItem(app, "savedSearch.save"))
    .toMatchObject({ enabled: true });
  await clickMenuItem(app, "savedSearch.save");

  await expect
    .poll(() => readSaved(userDataDir))
    .toMatchObject([{ query: 'subject:"out of office" & c++' }]);
  await expect.poll(() => savedSearchItems(app)).toHaveLength(1);

  const [itemId = ""] = await savedSearchItems(app);

  expect(await menuItem(app, itemId)).toStrictEqual({
    enabled: true,
    // Windows and Linux read a lone & in a menu label as an access key.
    label:
      process.platform === "darwin"
        ? 'subject:"out of office" & c++'
        : 'subject:"out of office" && c++',
  });
  expect(await menuItem(app, "savedSearch.save")).toMatchObject({
    enabled: false,
  });

  await view.evaluate(() => {
    location.hash = "#inbox";
  });
  await markDocument(view);
  await clickMenuItem(app, itemId);

  await expect
    .poll(() => hashOf(view))
    .toBe("#search/subject%3A%22out%20of%20office%22%20%26%20c%2B%2B");
  expect(
    await view.evaluate(() =>
      decodeURIComponent(location.hash.slice("#search/".length))
    )
  ).toBe('subject:"out of office" & c++');
  expect(await isSameDocument(view)).toBeTruthy();

  await clickMenuItem(app, itemId.replace(".open.", ".remove."));

  await expect.poll(() => readSaved(userDataDir)).toStrictEqual([]);
  await expect.poll(() => savedSearchItems(app)).toStrictEqual([]);
});

test("inserts the user styles file into Gmail's page alone, read again at each load", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const file = path.join(userDataDir, "gmail-user-styles.css");

  await writeFile(file, "body { outline: 3px solid rgb(1, 2, 3) !important; }");

  const app = await launchApp();
  const view = await findPage(app, standIn.url);
  const shell = await findPage(app, "meru-app:");

  await expect.poll(() => outline(view)).toBe("rgb(1, 2, 3)");
  expect(await outline(shell)).not.toBe("rgb(1, 2, 3)");

  await writeFile(file, "body { outline: 3px solid rgb(4, 5, 6) !important; }");
  await view.reload();
  await expect.poll(() => outline(view)).toBe("rgb(4, 5, 6)");
});
