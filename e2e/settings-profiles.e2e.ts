import type { ElectronApplication, Page } from "@playwright/test";

import { clickMenuItem, expect, findPage, readState, test } from "./lib/app.ts";
import {
  confirmRemovals,
  emitSettingsFocus,
  menuEnabled,
  openProfiles,
  openSettings,
  profileList,
  profileRow,
  scopeTab,
  seedProfiles,
} from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

interface SavedState {
  profiles: { id: string; name: string; color?: string }[];
}

const sections = (page: Page) =>
  page.getByRole("navigation", { name: "Settings sections" });

const settingsTitle = (page: Page) => page.getByRole("heading", { level: 1 });

const nameField = (page: Page) => page.getByRole("textbox", { name: "Name" });

const titlebarProfiles = (shell: Page) =>
  shell.getByRole("group", { name: "Profiles" }).getByRole("button");

/** The dot's colour on the profile's button in the main window's titlebar. */
const titlebarDot = (shell: Page, name: string) =>
  titlebarProfiles(shell)
    .filter({ hasText: name })
    .evaluate(
      (button) =>
        button.querySelector<HTMLElement>("span[aria-hidden]")?.style
          .backgroundColor
    );

const shellOf = (app: ElectronApplication) => findPage(app, "meru-app://shell");

/** The profiles' ids or names in `state.json`'s order. */
const storedProfiles = async (userDataDir: string, field: "id" | "name") => {
  const { profiles } = await readState<SavedState>(userDataDir);

  return profiles.map((profile) => profile[field]);
};

const back = (page: Page) => page.getByRole("button", { name: "Back" });
const forward = (page: Page) => page.getByRole("button", { name: "Forward" });

test("Add profile opens the new profile's page with its name chosen, and the titlebar shows it selected", async ({
  app,
  shell,
}) => {
  const page = await openSettings(app);

  await openProfiles(page);
  await page.getByRole("button", { name: "Add profile" }).click();

  await expect(settingsTitle(page)).toHaveText("Profile 2");
  await expect(nameField(page)).toBeFocused();
  expect(
    await nameField(page).evaluate((input: HTMLInputElement) => [
      input.selectionStart,
      input.selectionEnd,
    ])
  ).toStrictEqual([0, "Profile 2".length]);
  await expect(titlebarProfiles(shell)).toHaveText(["Default", "Profile 2"]);
  await expect(
    titlebarProfiles(shell).filter({ hasText: "Profile 2" })
  ).toHaveAttribute("aria-pressed", "true");
});

test("a profile is renamed on Enter and on leaving the field; Escape puts the name back and an empty one changes nothing", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const app = await launchApp();
  const shell = await shellOf(app);
  const page = await openSettings(app);
  const name = nameField(page);

  await openProfiles(page);
  await profileRow(page, "Work").click();
  await expect(settingsTitle(page)).toHaveText("Work");

  await name.fill("Job");
  await name.press("Enter");

  await expect(titlebarProfiles(shell)).toHaveText(["Home", "Job"]);
  await expect(settingsTitle(page)).toHaveText("Job");

  await name.fill("Side project");
  await name.press("Escape");

  await expect(name).toHaveValue("Job");

  await name.fill("   ");
  await name.press("Enter");

  await expect(name).toHaveValue("Job");

  await name.fill("Office");
  await name.blur();

  await expect(titlebarProfiles(shell)).toHaveText(["Home", "Office"]);

  await sections(page).getByRole("button", { name: "Notifications" }).click();

  await expect(scopeTab(page, "Office")).toBeVisible();
  await expect
    .poll(() => storedProfiles(userDataDir, "name"))
    .toStrictEqual(["Home", "Office"]);
});

test("a typed name is saved when the page is left without leaving the field, by the menu's Back or by closing the window, and Escape still discards it", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const app = await launchApp();
  const page = await openSettings(app);
  const name = nameField(page);

  await openProfiles(page);
  await profileRow(page, "Work").click();
  await name.fill("Side project");
  await name.press("Escape");
  await name.fill("Office");
  await emitSettingsFocus(app, "focus");
  await clickMenuItem(app, "tab.back");

  await expect(settingsTitle(page)).toHaveText("Profiles");
  await expect
    .poll(() => storedProfiles(userDataDir, "name"))
    .toStrictEqual(["Home", "Office"]);

  await profileRow(page, "Home").click();
  await name.fill("House");
  await name.press("Escape");
  await clickMenuItem(app, "tab.back");
  await expect(settingsTitle(page)).toHaveText("Profiles");

  // Main takes the calls in order, so a rename sent as the page went would
  // show in the title of the page opened after it.
  await profileRow(page, "Home").click();
  await expect(settingsTitle(page)).toHaveText("Home");
  await name.fill("Family");
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.getURL().startsWith("meru-app://settings")) {
        window.close();
      }
    }
  });

  await expect
    .poll(() => storedProfiles(userDataDir, "name"))
    .toStrictEqual(["Family", "Office"]);
});

test("a colour chosen changes the titlebar's dot, and a restart keeps it", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const app = await launchApp();
  const shell = await shellOf(app);
  const page = await openSettings(app);

  await openProfiles(page);
  await profileRow(page, "Work").click();

  const colour = page.getByRole("group", { name: "Colour" });

  await expect(colour.getByRole("button", { name: "Orange" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await colour.getByRole("button", { name: "Violet" }).click();

  await expect(colour.getByRole("button", { name: "Violet" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect
    .poll(() => titlebarDot(shell, "Work"))
    .toBe("oklch(0.58 0.2 285)");

  await app.close();

  const again = await launchApp();

  await expect
    .poll(async () => titlebarDot(await shellOf(again), "Work"))
    .toBe("oklch(0.58 0.2 285)");
});

test("a profile's handle moves it with the arrow keys, which the titlebar and state.json follow and a screen reader hears", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work", "Travel"]);

  const app = await launchApp();
  const shell = await shellOf(app);
  const page = await openSettings(app);
  const handle = page.getByRole("button", { name: "Move Travel" });

  await openProfiles(page);
  await handle.focus();
  await handle.press("ArrowUp");

  await expect(titlebarProfiles(shell)).toHaveText(["Home", "Travel", "Work"]);
  await expect(page.getByRole("status")).toHaveText(
    "Travel is now 2 of 3 in the titlebar."
  );
  await expect(handle).toBeFocused();

  await handle.press("ArrowUp");

  await expect(titlebarProfiles(shell)).toHaveText(["Travel", "Home", "Work"]);
  await expect(profileList(page).getByRole("listitem")).toHaveText([
    "Travel",
    "Home",
    "Work",
  ]);
  await expect
    .poll(() => storedProfiles(userDataDir, "id"))
    .toStrictEqual(["travel", "home", "work"]);
});

test("Remove profile asks; Cancel keeps the profile, and confirming removes it and goes back to the list", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const app = await launchApp();
  const shell = await shellOf(app);
  const page = await openSettings(app);
  const remove = page.getByRole("button", { name: "Remove profile…" });

  await openProfiles(page);
  await profileRow(page, "Work").click();
  await confirmRemovals(app, false);
  await remove.click();

  await expect
    .poll(() => askedRemovals(app))
    .toStrictEqual([["Remove Work?", "Settings"]]);
  await expect(settingsTitle(page)).toHaveText("Work");
  await expect(titlebarProfiles(shell)).toHaveText(["Home", "Work"]);

  await confirmRemovals(app, true);
  await remove.click();

  await expect(settingsTitle(page)).toHaveText("Profiles");
  await expect(profileList(page).getByRole("listitem")).toHaveText(["Home"]);
  await expect(titlebarProfiles(shell)).toHaveCount(0);
  await expect(forward(page)).toBeDisabled();
});

test("the last profile's Remove profile is disabled, saying why", async ({
  app,
}) => {
  const page = await openSettings(app);

  await openProfiles(page);
  await profileRow(page, "Default").click();

  const remove = page.getByRole("button", { name: "Remove profile…" });

  await expect(remove).toBeDisabled();
  await expect(remove).toHaveAccessibleDescription(
    "Meru needs at least one profile, so the last can't be removed."
  );
  await expect(page.getByRole("button", { name: /^Move /u })).toHaveCount(0);
});

test("Back and Forward step between the list and a profile's page, by button and by the menu's commands while Settings has focus", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Home", "Work"]);

  const app = await launchApp();
  const page = await openSettings(app);

  await openProfiles(page);
  await profileRow(page, "Work").click();
  await expect(settingsTitle(page)).toHaveText("Work");
  await expect(
    sections(page).getByRole("button", { name: "Profiles" })
  ).toHaveAttribute("aria-current", "page");

  await back(page).click();
  await expect(settingsTitle(page)).toHaveText("Profiles");
  await forward(page).click();
  await expect(settingsTitle(page)).toHaveText("Work");

  await emitSettingsFocus(app, "focus");
  await expect
    .poll(() => menuEnabled(app, ["tab.back", "tab.forward", "tab.reload"]))
    .toStrictEqual([true, false, false]);

  await clickMenuItem(app, "tab.back");
  await expect(settingsTitle(page)).toHaveText("Profiles");
  await clickMenuItem(app, "tab.back");
  await expect(settingsTitle(page)).toHaveText("Notifications");
  await expect
    .poll(() => menuEnabled(app, ["tab.back", "tab.forward"]))
    .toStrictEqual([false, true]);

  await clickMenuItem(app, "tab.forward");
  await expect(settingsTitle(page)).toHaveText("Profiles");
});

test("the Window menu no longer adds, renames or removes a profile, which Settings does", async ({
  app,
}) => {
  const windowLabels = () =>
    app.evaluate(({ Menu }) =>
      (
        Menu.getApplicationMenu()?.items.find((item) => item.label === "Window")
          ?.submenu?.items ?? []
      ).map((item) => item.label)
    );

  // The menu is set once startup has wired it.
  await expect.poll(windowLabels).toContain("Sleep Profile");

  const labels = await windowLabels();

  expect(labels).not.toContain("Add Profile");
  expect(labels).not.toContain("Rename Profile…");
  expect(labels).not.toContain("Remove Profile…");
});

/** What each removal's confirmation asked, and of which window. */
const askedRemovals = (app: ElectronApplication) =>
  app.evaluate(
    () => Reflect.get(globalThis, "meruTestConfirmations") as unknown[]
  );

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the Profiles list with several profiles and with one, and a profile's page, light and dark", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    await seedProfiles(userDataDir, standIn, [
      "Home",
      "Work",
      "Side project",
      "Travel",
    ]);

    const app = await launchApp();
    const page = await openSettings(app);

    await openProfiles(page);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({ path: shotPath("settings-profiles", theme) });
    }

    await profileRow(page, "Work").click();
    await expect(settingsTitle(page)).toHaveText("Work");

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({
        path: shotPath("settings-profile-page", theme),
      });
    }

    await app.close();
    await seedProfiles(userDataDir, standIn, ["Home"]);

    const lone = await launchApp();
    const lonePage = await openSettings(lone);

    await openProfiles(lonePage);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(lone, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await lonePage.screenshot({
        path: shotPath("settings-profiles-one", theme),
      });
    }
  });
});
