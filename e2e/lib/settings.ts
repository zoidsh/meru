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
    dialog.showMessageBox = ((
      window: unknown,
      options: { message: string }
    ) => {
      asked.push([
        options.message,
        window instanceof BrowserWindow ? window.getTitle() : undefined,
      ]);

      return Promise.resolve({
        response: answer ? 0 : 1,
        checkboxChecked: false,
      });
    }) as unknown as typeof dialog.showMessageBox;
  }, confirm);
