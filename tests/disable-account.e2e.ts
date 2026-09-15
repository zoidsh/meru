/*
 * Turning an account off without removing it.
 *
 * A disabled account stays in the config with its label, its color, its saved
 * tabs and its signed-in session, and the app runs as though it were not there:
 * no instance, no view, no menu entry, no switcher button. The claim worth
 * testing is that absence, so each case reads a surface the app builds from
 * `getAccountConfigs()` rather than the config the test seeded, which would say
 * two accounts either way.
 *
 * Which accounts run is decided once, at launch. The cases that toggle the
 * switch are therefore as much about what does not happen in the running app:
 * the accounts listeners fan out synchronously from the write, and one of them
 * asking for an account that was never constructed takes the main process down
 * behind Electron's error dialog.
 *
 * Pro, because a second account is Pro and a single seeded account could not
 * show anything being left out. The license setup is `useProApp`'s, as in
 * `pro.e2e.ts`.
 *
 * Three launches rather than one, because `useApp` seeds every test in the
 * group it is called in and the cases need different accounts: one account
 * disabled, both enabled, and one account on its own. Each group gets its own.
 */
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { type MeruApp, useProApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

/**
 * The account labels the Accounts submenu offers, which the main process builds
 * from `accounts.getAccounts()`, so a disabled account that still turned up
 * here would be one the app had constructed.
 *
 * Reading it at all is also what says the main process is still answering. An
 * accounts listener that threw puts up Electron's error dialog and blocks the
 * main process behind it, and nothing evaluates after that.
 */
function readAccountsMenuLabels(meru: MeruApp) {
  return meru.app.evaluate(({ Menu }) => {
    const accountsMenu = Menu.getApplicationMenu()?.items.find(
      (menuItem) => menuItem.label === "Accounts",
    );

    const items = accountsMenu?.submenu?.items ?? [];

    const separatorIndex = items.findIndex((menuItem) => menuItem.type === "separator");

    if (separatorIndex === -1) {
      throw new Error(
        "The Accounts submenu has no separator, so its accounts cannot be told from its commands",
      );
    }

    return items.slice(0, separatorIndex).map((menuItem) => menuItem.label);
  });
}

/** The rows of the accounts list in settings, which lists what the config holds. */
async function openAccountsSettings(meru: MeruApp) {
  const navigation = await meru.openSettings();

  await openSettingsPage(meru, navigation, "Accounts");

  return meru.renderer.locator('[data-slot="item-group"] [data-slot="item"]');
}

/** Opens one account's edit dialog, flips Disabled and saves. */
async function toggleDisabled(meru: MeruApp, label: string) {
  const accountItems = await openAccountsSettings(meru);

  await accountItems
    .filter({ hasText: label })
    .getByRole("button", { name: "Edit account" })
    .click();

  await meru.renderer.getByRole("switch", { name: "Disabled" }).click();

  await meru.renderer.getByRole("button", { name: "Save" }).click();

  // The switch is one of the settings that only take effect on the next launch,
  // so the toast is the whole of what the user is told.
  await expect(meru.renderer.getByText("Restart Meru to apply the changes.")).toBeVisible();
}

function readAccountDisabled(meru: MeruApp, accountId: string) {
  return async () =>
    (await meru.readConfig()).accounts?.find((account) => account.id === accountId)?.disabled;
}

test.describe("with the second account disabled", () => {
  const meru = useProApp({
    accounts: [
      seedAccount({ id: "first-account", label: "Personal" }),
      seedAccount({ id: "second-account", label: "Work", selected: false, disabled: true }),
    ],
  });

  test("the app runs on the enabled account alone", async () => {
    expect(await readAccountsMenuLabels(meru)).toEqual(["Personal"]);

    /*
     * The titlebar renders no account buttons at all below two accounts, so the
     * claim is that both are gone rather than that Work alone is. That is the
     * whole of the switcher: with one account to run there is nothing to switch
     * between.
     */
    await expect(meru.renderer.getByRole("button", { name: "Work" })).toHaveCount(0);

    await expect(meru.renderer.getByRole("button", { name: "Personal" })).toHaveCount(0);
  });

  test("settings still lists it, marked disabled", async () => {
    const accountItems = await openAccountsSettings(meru);

    await expect(accountItems).toHaveCount(2);

    await expect(accountItems.nth(0)).toContainText("Personal");

    await expect(accountItems.nth(1)).toContainText("Work");

    // The point of the feature: the account is kept, not removed, so the list
    // is where it stays reachable.
    await expect(accountItems.nth(1).getByText("Disabled", { exact: true })).toBeVisible();

    await expect(accountItems.nth(0).getByText("Disabled", { exact: true })).toHaveCount(0);
  });

  test("it can be removed, without an instance to remove it through", async () => {
    const accountItems = await openAccountsSettings(meru);

    await accountItems
      .filter({ hasText: "Work" })
      .getByRole("button", { name: "Remove account" })
      .click();

    await meru.renderer
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove account" })
      .click();

    await expect
      .poll(async () => (await meru.readConfig()).accounts?.map((account) => account.id))
      .toEqual(["first-account"]);

    expect(await readAccountsMenuLabels(meru)).toEqual(["Personal"]);
  });

  test("turning it back on waits for the next launch", async () => {
    await toggleDisabled(meru, "Work");

    await expect.poll(readAccountDisabled(meru, "second-account")).toBe(false);

    // Unchanged, because Meru never constructed this account and cannot start
    // one mid-session. Reading the menu at all is what says the listeners the
    // write fanned out to did not throw.
    expect(await readAccountsMenuLabels(meru)).toEqual(["Personal"]);
  });
});

test.describe("with both accounts enabled", () => {
  const meru = useProApp({
    accounts: [
      seedAccount({ id: "first-account", label: "Personal" }),
      seedAccount({ id: "second-account", label: "Work", selected: false }),
    ],
  });

  test("turning Disabled on writes it and asks for a restart", async () => {
    await toggleDisabled(meru, "Work");

    await expect.poll(readAccountDisabled(meru, "second-account")).toBe(true);
  });

  test("the selected account can be turned off too", async () => {
    // The one that takes the selection with it, which is the state the launch
    // guards repair on the way back up.
    await toggleDisabled(meru, "Personal");

    await expect.poll(readAccountDisabled(meru, "first-account")).toBe(true);

    expect(await readAccountsMenuLabels(meru)).toEqual(["Personal", "Work"]);
  });
});

test.describe("with one account", () => {
  const meru = useProApp({
    accounts: [seedAccount({ id: "first-account", label: "Personal" })],
  });

  test("the last enabled account cannot be turned off", async () => {
    const accountItems = await openAccountsSettings(meru);

    await accountItems.getByRole("button", { name: "Edit account" }).click();

    await expect(meru.renderer.getByRole("switch", { name: "Disabled" })).toBeDisabled();
  });
});
