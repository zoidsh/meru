import type { ElectronApplication, Page } from "@playwright/test";

import { clickMenuItem, expect, findPage, writeState } from "./app.ts";
import type { StandIn } from "./stand-in.ts";

export const SETTINGS_URL = "meru-app://settings/";

/**
 * Tells the Settings window it gained or lost focus, as the system would; the
 * suite's app is never the active app, so the system never does.
 */
export const emitSettingsFocus = (
  app: ElectronApplication,
  event: "focus" | "blur"
) =>
  app.evaluate(
    ({ BrowserWindow }, { url, name }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().startsWith(url))
        ?.emit(name);
    },
    { url: SETTINGS_URL, name: event }
  );

/** Whether the application menu's items are enabled, by id. */
export const menuEnabled = (app: ElectronApplication, ids: readonly string[]) =>
  app.evaluate(
    ({ Menu }, itemIds) =>
      itemIds.map(
        (id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.enabled
      ),
    ids
  );

/** Runs Settings… from the app menu, and gives the Settings window's page. */
export const openSettings = async (app: ElectronApplication) => {
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

export const seedProfiles = (
  userDataDir: string,
  standIn: StandIn,
  names: readonly string[],
  selected = 0
) => {
  const ids = names.map((name) => name.toLowerCase().replaceAll(" ", "-"));

  return writeState(userDataDir, {
    profiles: names.map((name, index) => ({
      id: ids[index],
      name,
      tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
      selectedTabId: "gmail",
    })),
    selectedProfileId: ids[selected],
  });
};

export const scopeTab = (page: Page, name: string) =>
  page
    .getByRole("tablist", { name: "Scope" })
    .getByRole("tab", { name, exact: true });

/**
 * Stands in for the native confirmation of a profile's removal, which would
 * show on the desktop: answers it with its first button, Remove Profile, or
 * with Cancel, and keeps on `meruTestConfirmations` what each asked and
 * the title of the window it showed on.
 */
export const confirmRemovals = (app: ElectronApplication, confirm = true) =>
  app.evaluate(({ dialog, BrowserWindow }, answer) => {
    const asked: unknown[] =
      (Reflect.get(globalThis, "meruTestConfirmations") as
        | unknown[]
        | undefined) ?? [];

    Reflect.set(globalThis, "meruTestConfirmations", asked);
    dialog.showMessageBox = ((window: unknown, options: object) => {
      asked.push({
        ...options,
        window: window instanceof BrowserWindow ? window.getTitle() : undefined,
      });

      return Promise.resolve({
        response: answer ? 0 : 1,
        checkboxChecked: false,
      });
    }) as unknown as typeof dialog.showMessageBox;
  }, confirm);

/** Each confirmation asked so far: its options and the title of its window. */
export const askedRemovals = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestConfirmations") as
        | unknown[]
        | undefined) ?? []
  );

const sections = (page: Page) =>
  page.getByRole("navigation", { name: "Settings sections" });

/** Shows a section of the Settings window from its nav. */
export const openSection = (page: Page, name: string) =>
  sections(page).getByRole("button", { name }).click();

export const profileList = (page: Page) =>
  page.getByRole("list", { name: "Profiles" });

/** Shows the Profiles list. */
export const openProfiles = async (page: Page) => {
  await openSection(page, "Profiles");
  await expect(profileList(page)).toBeVisible();
};

/** The row in the Profiles list that opens the profile's page. */
export const profileRow = (page: Page, name: string) =>
  profileList(page).getByRole("button", { name, exact: true });

/** Adds a profile with Add profile in Settings, which opens its page. */
export const addProfileInSettings = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openProfiles(page);
  await page.getByRole("button", { name: "Add profile" }).click();
  await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();

  return page;
};

/**
 * Presses Remove profile… on the profile's page in Settings; the
 * confirmation is to be stood in for first.
 */
export const removeProfileInSettings = async (page: Page, name: string) => {
  await openProfiles(page);
  await profileRow(page, name).click();
  await page.getByRole("button", { name: "Remove profile…" }).click();
};
