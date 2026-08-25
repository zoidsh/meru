/*
 * What Meru unlocks when the license is valid.
 *
 * Every other suite runs as the free version, which is what makes the gating
 * walk in `settings.e2e.ts` possible and what leaves this uncovered: the whole
 * Pro surface is reached through `licenseKey.isValid`, an in-memory flag set
 * only by a successful API response. No config key sets it and no seed fakes
 * it, so nothing below is reachable without a key that validates.
 *
 * The key is a real one against the production backend rather than a stub. That
 * settles the objection a stub would leave open — that the tests prove Meru
 * responds correctly to an entitlement answer, never that the real API returns
 * what Meru thinks. It costs a live dependency on every launch in this file,
 * which is the trade being made deliberately.
 *
 * Scope is the wiring rather than the rendering. How ~47 gated fields draw in
 * two states is a matrix that belongs where a state is cheap to reach; what
 * needs a running app is that an entitlement crosses the main process, the IPC
 * boundary and the menu — so there is one settings assertion here, as proof the
 * answer arrived, and not a walk of every route.
 */
import { expect, test } from "@playwright/test";
import { useProApp } from "./lib/app";

/** The shape `accounts` is stored in, with only the two labels differing. */
function account(id: string, label: string, selected: boolean) {
  return {
    id,
    label,
    color: null,
    selected,
    notifications: true,
    gmail: { unreadBadge: true, delegatedAccountId: null, unifiedInbox: true },
    workspaceApps: { savedTabs: [], bookmarks: [] },
  };
}

/*
 * Two accounts, because one is what the free version slices down to and a
 * single seeded account would prove nothing about whether it did.
 */
const meru = useProApp({
  accounts: [account("first-account", "Personal", true), account("second-account", "Work", false)],
});

test("both accounts survive into the app", async () => {
  /*
   * Read off the Accounts menu rather than the config file, because the config
   * is what the test seeded and would say two either way. The menu is built
   * from `accounts.getAccounts()`, which comes from `getAccountConfigs()` — the
   * call that slices to the first account alone without a valid license.
   */
  const accountLabels = await meru.app.evaluate(({ Menu }) => {
    const accountsMenu = Menu.getApplicationMenu()?.items.find(
      (menuItem) => menuItem.label === "Accounts",
    );

    const items = accountsMenu?.submenu?.items ?? [];

    /*
     * Up to the first separator: everything after it is a command rather than
     * an account. Guarded rather than sliced straight, because findIndex
     * answers -1 for a submenu that lost its separator and slice(0, -1) would
     * quietly drop the last item and go on reporting a plausible list.
     */
    const separatorIndex = items.findIndex((menuItem) => menuItem.type === "separator");

    if (separatorIndex === -1) {
      throw new Error(
        "The Accounts submenu has no separator, so its accounts cannot be told from its commands",
      );
    }

    return items.slice(0, separatorIndex).map((menuItem) => menuItem.label);
  });

  expect(accountLabels).toEqual(["Personal", "Work"]);
});

test("Unified Inbox is enabled once its three conditions hold", async () => {
  /*
   * The free version's menu suite asserts this item comes up disabled, and says
   * it cannot tell which of the three conditions did it — a valid license, the
   * setting on, more than one account. This is the other half: with the license
   * valid, the setting at its default and two accounts seeded, all three hold
   * and the item is live.
   */
  const unifiedInbox = await meru.app.evaluate(({ Menu }) => {
    const find = (menuItems: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const menuItem of menuItems) {
        if (menuItem.label === "Unified Inbox") {
          return menuItem;
        }

        const found = menuItem.submenu ? find(menuItem.submenu.items) : undefined;

        if (found) {
          return found;
        }
      }

      return undefined;
    };

    const menuItem = find(Menu.getApplicationMenu()?.items ?? []);

    return menuItem ? { enabled: menuItem.enabled } : null;
  });

  expect(unifiedInbox).toEqual({ enabled: true });
});

test("a Pro-gated settings page unlocks", async () => {
  const navigation = await meru.openSettings();

  await navigation.getByRole("button", { name: "Blocker", exact: true }).click();

  await expect(meru.renderer.getByTestId("settings-title")).toContainText("Blocker");

  /*
   * One page rather than the walk `settings.e2e.ts` does, because this is here
   * to prove the entitlement reached the renderer at all. Blocker is the page
   * chosen for it: every field on it is gated, so there is nothing on it that
   * would look the same either way.
   */
  await expect(meru.renderer.getByText("Meru Pro required", { exact: true })).toHaveCount(0);

  /*
   * And the controls the badge was making the claim about. A page that failed
   * to render would also carry no badges, so the absence on its own is not the
   * assertion — these being usable is.
   */
  for (const configKey of ["blocker.enabled", "blocker.ads", "blocker.tracking"]) {
    await expect(
      meru.renderer.locator(`[aria-labelledby="${configKey}-label"]`),
      configKey,
    ).toBeEnabled();
  }
});
