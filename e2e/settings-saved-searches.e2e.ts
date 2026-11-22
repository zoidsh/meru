import type { ElectronApplication, Page } from "@playwright/test";

import {
  clickMenuItem,
  expect,
  findPage,
  readState,
  test,
  writeState,
} from "./lib/app.ts";
import { openProfiles, openSettings, profileRow } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";
import type { StandIn } from "./lib/stand-in.ts";

/** One profile, Home, with Gmail open and these saved searches. */
const seed = (
  userDataDir: string,
  standIn: StandIn,
  savedSearches?: Record<string, string>[]
) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "home",
        name: "Home",
        tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
        selectedTabId: "gmail",
        ...(savedSearches && { savedSearches }),
      },
    ],
    selectedProfileId: "home",
  });

const openHome = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openProfiles(page);
  await profileRow(page, "Home").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");

  return page;
};

/** The labels of the Mail menu's items that run a saved search, in order. */
const menuSearches = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => {
    const labels: string[] = [];
    const walk = (menu: Electron.Menu | null | undefined) => {
      for (const item of menu?.items ?? []) {
        // An item made without an id has none.
        if ((item.id as string | undefined)?.startsWith("savedSearch.open.")) {
          labels.push(item.label);
        }

        walk(item.submenu);
      }
    };

    walk(Menu.getApplicationMenu());

    return labels;
  });

const readSaved = async (userDataDir: string) => {
  const { profiles } = await readState<{
    profiles: { savedSearches?: unknown }[];
  }>(userDataDir);

  return profiles[0]?.savedSearches;
};

/** A saved search's row, named by its name, else its query. */
const row = (page: Page, shown: string) =>
  page.getByRole("group", { name: shown, exact: true });

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

const addForm = (page: Page) =>
  page.getByRole("group", { name: "Add saved search" });

const searchField = (page: Page) =>
  addForm(page).getByRole("textbox", { name: "Search" });

const add = async (page: Page, query: string, name?: string) => {
  await button(page, "Add saved search").click();
  await expect(searchField(page)).toBeFocused();
  await searchField(page).fill(query);

  if (name !== undefined) {
    await addForm(page).getByRole("textbox", { name: "Name" }).fill(name);
  }

  await addForm(page).getByRole("button", { name: "Save" }).click();
};

test("adds a search with and without a name, which the Mail menu lists and a restart keeps", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const first = await launchApp();
  const page = await openHome(first);

  await expect(
    page.getByText(
      "No saved searches yet. Save a search from the Mail menu, or add one here."
    )
  ).toBeVisible();

  await add(page, " is:unread ");
  await expect(button(page, "Add saved search")).toBeFocused();
  await add(page, "has:attachment", " Files ");
  await expect(button(page, "Add saved search")).toBeFocused();

  await expect(row(page, "is:unread")).toBeVisible();
  await expect(row(page, "Files")).toContainText("has:attachment");
  await expect(row(page, "is:unread")).not.toContainText("has:attachment");
  await expect
    .poll(() => menuSearches(first))
    .toStrictEqual(["is:unread", "Files"]);
  await expect
    .poll(() => readSaved(userDataDir))
    .toMatchObject([
      { query: "is:unread" },
      { query: "has:attachment", label: "Files" },
    ]);
  await first.close();

  const second = await launchApp();
  const again = await openHome(second);

  await expect(button(again, "Rename is:unread")).toBeVisible();
  await expect(row(again, "Files")).toContainText("has:attachment");
  await expect
    .poll(() => menuSearches(second))
    .toStrictEqual(["is:unread", "Files"]);
});

test("refuses an empty and a repeated search with the reason under Search, and Cancel adds nothing", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, [{ id: "a", query: "is:unread" }]);

  const app = await launchApp();
  const page = await openHome(app);

  await add(page, "   ");

  const reason = addForm(page).getByRole("alert");

  await expect(reason).toHaveText("Enter a search.");
  await expect(searchField(page)).toBeFocused();
  await expect(searchField(page)).toHaveAttribute("aria-invalid", "true");
  await expect(searchField(page)).toHaveAccessibleDescription(
    "Enter a search."
  );

  await searchField(page).fill(" is:unread");
  await searchField(page).press("Enter");
  await expect(reason).toHaveText("This search is saved already.");
  await expect(searchField(page)).toBeFocused();

  await addForm(page).getByRole("button", { name: "Cancel" }).click();
  await expect(addForm(page)).toHaveCount(0);
  await expect(button(page, "Add saved search")).toBeFocused();
  expect(await readSaved(userDataDir)).toStrictEqual([
    { id: "a", query: "is:unread" },
  ]);
});

test("renames by Enter and by leaving the field, keeps the name on Escape, clears it when empty, and Remove moves focus on", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, [
    { id: "a", query: "is:unread" },
    { id: "b", query: "has:attachment", label: "Files" },
    { id: "c", query: "in:sent" },
  ]);

  const app = await launchApp();
  const page = await openHome(app);
  const nameOf = (shown: string) =>
    page.getByRole("textbox", { name: `Name of ${shown}` });

  await button(page, "Rename is:unread").click();
  await expect(nameOf("is:unread")).toBeFocused();
  await expect(nameOf("is:unread")).toHaveAttribute("placeholder", "is:unread");
  await nameOf("is:unread").fill("Unread");
  await nameOf("is:unread").press("Enter");
  await expect(button(page, "Rename Unread")).toBeFocused();
  await expect(row(page, "Unread")).toContainText("is:unread");

  await button(page, "Rename Files").click();
  await nameOf("Files").fill("Attachments");
  await nameOf("Files").press("Escape");
  await expect(button(page, "Rename Files")).toBeFocused();
  await expect(row(page, "Files")).toBeVisible();

  await button(page, "Rename Files").click();
  await nameOf("Files").fill("Documents");
  await nameOf("Files").press("Tab");
  await expect(row(page, "Documents")).toBeVisible();

  // Sent before the rename below, so its menu shows whether it removed one.
  await button(page, "Remove Unread").dispatchEvent("click", { detail: 2 });
  await button(page, "Rename Documents").click();
  await nameOf("Documents").fill("");
  await nameOf("Documents").press("Enter");
  await expect(row(page, "has:attachment")).toBeVisible();
  await expect
    .poll(() => menuSearches(app))
    .toStrictEqual(["Unread", "has:attachment", "in:sent"]);

  // Focus is checked once the row has gone, which redraws the rows after it.
  await button(page, "Remove Unread").click();
  await expect(row(page, "Unread")).toHaveCount(0);
  await expect(button(page, "Remove has:attachment")).toBeFocused();
  await button(page, "Remove in:sent").click();
  await expect(row(page, "in:sent")).toHaveCount(0);
  await expect(button(page, "Add saved search")).toBeFocused();
  await expect
    .poll(() => readSaved(userDataDir))
    .toStrictEqual([{ id: "b", query: "has:attachment" }]);
  await expect.poll(() => menuSearches(app)).toStrictEqual(["has:attachment"]);
});

test("removing the last row with the add form open focuses Search, and Save or Cancel then focuses Add saved search", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn, [
    { id: "a", query: "is:unread" },
    { id: "b", query: "in:sent" },
  ]);

  const app = await launchApp();
  const page = await openHome(app);

  await button(page, "Add saved search").click();
  await button(page, "Remove in:sent").click();
  await expect(row(page, "in:sent")).toHaveCount(0);
  await expect(searchField(page)).toBeFocused();
  await searchField(page).fill("is:starred");
  await addForm(page).getByRole("button", { name: "Save" }).click();
  await expect(button(page, "Add saved search")).toBeFocused();

  await button(page, "Add saved search").click();
  await button(page, "Remove is:starred").click();
  await expect(row(page, "is:starred")).toHaveCount(0);
  await expect(searchField(page)).toBeFocused();
  await addForm(page).getByRole("button", { name: "Cancel" }).click();
  await expect(button(page, "Add saved search")).toBeFocused();

  await button(page, "Add saved search").click();
  await button(page, "Remove is:unread").click();
  await expect(row(page, "is:unread")).toHaveCount(0);
  await expect(searchField(page)).toBeFocused();
  await searchField(page).press("Escape");
  await expect(button(page, "Add saved search")).toBeFocused();
});

test("a search saved from Gmail's menu shows on the open page", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const view = await findPage(app, standIn.url);
  const page = await openHome(app);

  await view.evaluate(() => {
    location.hash = "#search/is%3Astarred";
  });
  await expect
    .poll(() =>
      app.evaluate(
        ({ Menu }) =>
          Menu.getApplicationMenu()?.getMenuItemById("savedSearch.save")
            ?.enabled
      )
    )
    .toBe(true);
  await clickMenuItem(app, "savedSearch.save");

  await expect(row(page, "is:starred")).toBeVisible();
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the card empty, with named and unnamed searches, and the add form refusing a repeat, light and dark", async ({
    launchApp,
    standIn,
    userDataDir,
  }) => {
    await seed(userDataDir, standIn);

    const app = await launchApp();
    const page = await openHome(app);
    const card = page.getByText("Saved searches", { exact: true });
    const shoot = async (surface: string, shown = card) => {
      await shown.scrollIntoViewIfNeeded();

      for (const theme of THEMES) {
        // oxlint-disable-next-line no-await-in-loop -- one theme at a time
        await emulateTheme(app, theme);
        // oxlint-disable-next-line no-await-in-loop -- one after another
        await page.screenshot({ path: shotPath(surface, theme) });
      }
    };

    await shoot("settings-saved-searches-empty");

    await add(page, "is:unread");
    await add(page, "has:attachment larger:10M", "Big attachments");
    await add(page, 'from:billing@example.com subject:"invoice"', "Invoices");
    await expect(row(page, "Invoices")).toBeVisible();
    await shoot("settings-saved-searches");

    await add(page, "is:unread");
    await expect(addForm(page).getByRole("alert")).toHaveText(
      "This search is saved already."
    );
    await shoot(
      "settings-saved-searches-add-refused",
      addForm(page).getByRole("button", { name: "Save" })
    );
  });
});
