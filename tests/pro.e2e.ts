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
 * Each claim is made where a user would meet it. The menu and the titlebar both
 * carry the account list and the unified inbox, and they come by them
 * differently — the menu from the main process directly, the titlebar from the
 * accounts the renderer was handed at load — so both are asserted rather than
 * one standing in for the other.
 *
 * The settings walk is the exact inverse of the free version's in
 * `settings.e2e.ts`: the same marker, the same groups, the opposite
 * expectation. Neither suite keeps a list of which fields are gated, so a field
 * that gains or loses its gate is picked up by both or by neither.
 */
import { expect, test } from "@playwright/test";
import { useProApp } from "./lib/app";
import { openSettingsPage, readSettingsPageLabels } from "./lib/settings";

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
  /*
   * Turned on so that the field depending on it has its own precondition met.
   * `verificationCodes.copyMode` is gated twice — by the license and by this
   * switch — and leaving it off would have the walk below reading a lock the
   * license had nothing to do with.
   */
  "verificationCodes.autoCopy": true,
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

test("both accounts are in the titlebar, and switching writes back", async () => {
  /*
   * The titlebar is how anyone actually switches account; the menu covers the
   * same slicing from the main process side. An account button is only rendered
   * when there is more than one account to choose between, so the free version
   * — sliced to one — renders none of them at all.
   */
  const personal = meru.renderer.getByRole("button", { name: "Personal" });

  const work = meru.renderer.getByRole("button", { name: "Work" });

  await expect(personal).toBeVisible();

  await expect(work).toBeVisible();

  await work.click();

  /*
   * Polled against the config the main process writes rather than the button's
   * own styling. Clicking sends `accounts.selectAccount`, which persists the
   * selection, so this is the whole round trip — and the button would read as
   * selected from its variant either way.
   */
  await expect
    .poll(
      async () => (await meru.readConfig()).accounts?.find((account) => account.selected)?.label,
    )
    .toBe("Work");
});

test("the unified inbox opens from the titlebar", async () => {
  const unifiedInbox = meru.renderer.getByRole("button", { name: "Open unified inbox" });

  // Same three conditions as the menu item, rendered where a user would reach
  // for it: a valid license, the setting on, and more than one account.
  await expect(unifiedInbox).toBeVisible();

  await unifiedInbox.click();

  await expect.poll(() => new URL(meru.renderer.url()).hash).toBe("#/unified-inbox");
});

test("every Pro-gated control is unlocked", async () => {
  const unlockedGroups: string[] = [];

  const navigation = await meru.openSettings();

  for (const label of await readSettingsPageLabels(navigation)) {
    // As in the free version's walk: read the page this loop is on, not the one
    // before it.
    await openSettingsPage(meru, navigation, label);

    /*
     * The exact inverse of `settings.e2e.ts`, over the same marker and the same
     * groups. There the claim is that a gated field is locked; here it is that
     * the same fields are usable once the license is valid. Neither keeps a
     * list, so a field that gained or lost its gate is walked by both.
     */
    const gatedControls = await meru.renderer.locator("[data-meru-pro]").evaluateAll((markers) =>
      markers.map((marker) => {
        const group = marker.closest(
          '[data-slot="field"], [data-slot="field-set"], [data-slot="item"]',
        );

        const controls = group
          ? (Array.from(
              group.querySelectorAll("input, button, select, textarea"),
            ) as (typeof marker)[])
          : [];

        return {
          field: (group?.textContent ?? "").trim().slice(0, 60),
          usable: controls
            .filter((control) => !control.matches(":disabled"))
            .map((control) => (control.textContent ?? "").trim()),
        };
      }),
    );

    /*
     * The page-level half of the gate, gone. It is what says a page is gated on
     * the routes carrying no field badge — saved searches locks its Add button
     * straight off the license — so its absence is the only claim covering
     * them.
     */
    await expect(
      meru.renderer.getByRole("link", { name: "Upgrade", exact: true }),
      label,
    ).toHaveCount(0);

    for (const { field, usable } of gatedControls) {
      /*
       * One is enough, and is the exact inverse of the free version's claim
       * that a gated group has no usable control at all. Demanding every
       * control would fail on the ones carrying a second gate of their own —
       * an extension that isn't installed, a select waiting on the switch
       * above it — and neither of those is the license.
       *
       * Soft, so every gated field on the page reports rather than only the
       * first one to fail. It also covers a group holding no controls at all,
       * which would otherwise read as unlocked without anything being checked.
       */
      expect.soft(usable.length, `${label} — ${field}`).toBeGreaterThan(0);

      unlockedGroups.push(field);
    }
  }

  /*
   * Guards the walk itself, and ties it to the free version's: that suite
   * asserts the same marker finds more than thirty gated fields, so a marker
   * that stopped matching cannot leave both of them reporting clean.
   */
  expect(unlockedGroups.length).toBeGreaterThan(30);
});
