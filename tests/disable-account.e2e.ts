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
 * The switch takes effect at once, so the cases that flip it assert on the
 * running app rather than on what the next launch would do. What makes that
 * worth asserting from both sides is that the two directions are not each
 * other's inverse: turning an account off destroys its `Gmail` and takes its
 * view out of the window, and turning one on has to build a fresh `Account`
 * because neither can be brought back.
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
import { readViews } from "./lib/views";

/**
 * The account labels the Accounts submenu offers, which the main process builds
 * from `accounts.getAccounts()`, so a disabled account that still turned up
 * here would be one the app was running.
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

/**
 * How many of the window's child views are running in one account's session.
 *
 * A view is the account as far as the window is concerned, and a partitioned
 * session names its partition in the storage path, so this is what says an
 * account is up or gone without asking the app to describe itself.
 */
async function countAccountViews(meru: MeruApp, accountId: string) {
  const views = await readViews(meru);

  return views.filter((view) => view.storagePath.includes(accountId)).length;
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

  await expect(meru.renderer.getByRole("dialog")).toHaveCount(0);
}

/**
 * Leaves settings for the account view, through the menu item a user would use.
 *
 * Waited out on the navigation controls, which only the account titlebar draws.
 * The switcher buttons are what the callers then assert on, and half of them
 * assert an absence, which a titlebar still showing Settings would satisfy
 * without anything having been checked.
 */
async function returnToAccountView(meru: MeruApp, label: string) {
  expect(await meru.runMenuCommand(label)).toBe(true);

  await expect(meru.renderer.getByRole("button", { name: "Go back" })).toBeVisible();
}

function readAccount(meru: MeruApp, accountId: string) {
  return async () =>
    (await meru.readConfig()).accounts?.find((account) => account.id === accountId);
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

    expect(await countAccountViews(meru, "second-account")).toBe(0);

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

  test("turning it back on brings the account up there and then", async () => {
    await toggleDisabled(meru, "Work");

    await expect
      .poll(async () => (await readAccount(meru, "second-account")())?.disabled)
      .toBe(false);

    // The account Meru never constructed at launch, constructed now. Nothing
    // short of a whole new `Account` would do: the one this config entry had
    // was never built, and a destroyed one could not be brought back either.
    await expect.poll(() => countAccountViews(meru, "second-account")).toBe(1);

    expect(await readAccountsMenuLabels(meru)).toEqual(["Personal", "Work"]);

    await returnToAccountView(meru, "Personal");

    const personal = meru.renderer.getByRole("button", { name: "Personal" });

    const work = meru.renderer.getByRole("button", { name: "Work" });

    await expect(personal).toBeVisible();

    await expect(work).toBeVisible();

    await work.click();

    await expect
      .poll(async () => (await readAccount(meru, "second-account")())?.selected)
      .toBe(true);

    // Last is the view in front, which is where selecting an account puts it.
    await expect
      .poll(async () => (await readViews(meru)).at(-1)?.storagePath.includes("second-account"))
      .toBe(true);
  });
});

test.describe("with both accounts enabled", () => {
  const meru = useProApp({
    accounts: [
      seedAccount({ id: "first-account", label: "Personal" }),
      seedAccount({ id: "second-account", label: "Work", selected: false }),
    ],
  });

  test("turning one off takes it out of the running app", async () => {
    await toggleDisabled(meru, "Work");

    await expect
      .poll(async () => (await readAccount(meru, "second-account")())?.disabled)
      .toBe(true);

    await expect.poll(() => countAccountViews(meru, "second-account")).toBe(0);

    expect(await readAccountsMenuLabels(meru)).toEqual(["Personal"]);

    await returnToAccountView(meru, "Personal");

    await expect(meru.renderer.getByRole("button", { name: "Work" })).toHaveCount(0);

    await expect(meru.renderer.getByRole("button", { name: "Personal" })).toHaveCount(0);
  });

  test("turning the selected one off hands the selection over", async () => {
    // The account the rest of the app is pointed at, so this is the case where
    // turning one off has to move the selection in the same write. An account
    // listener asking for the selected account between the two would find one
    // Meru had just destroyed.
    await toggleDisabled(meru, "Personal");

    await expect
      .poll(async () => (await readAccount(meru, "first-account")())?.disabled)
      .toBe(true);

    await expect
      .poll(async () => (await readAccount(meru, "second-account")())?.selected)
      .toBe(true);

    await expect.poll(() => countAccountViews(meru, "first-account")).toBe(0);

    expect(await countAccountViews(meru, "second-account")).toBe(1);

    expect(await readAccountsMenuLabels(meru)).toEqual(["Work"]);
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
