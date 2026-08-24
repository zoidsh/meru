/*
 * The application menu, read out of the main process.
 *
 * What the OS draws is still not assertable — a `Menu.popup` menu, the tray, a
 * file dialog. The menu Electron was handed is, and so is what its items do
 * when clicked, which is where the bugs live: a shortcut that quietly stopped
 * being registered, two commands claiming one key, an item enabled when the
 * account it acts on isn't there.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp();

/** Every menu item, flattened, submenus included. */
function readMenuItems() {
  return meru.app.evaluate(({ Menu }) => {
    const items: { label: string; accelerator: string | null; enabled: boolean }[] = [];

    const collect = (menuItems: Electron.MenuItem[]) => {
      for (const menuItem of menuItems) {
        items.push({
          label: menuItem.label,
          accelerator: menuItem.accelerator ?? null,
          enabled: menuItem.enabled,
        });

        if (menuItem.submenu) {
          collect(menuItem.submenu.items);
        }
      }
    };

    collect(Menu.getApplicationMenu()?.items ?? []);

    return items;
  });
}

/** Runs a command the way the menu bar would, and reports whether it was there. */
function clickMenuItem(label: string) {
  return meru.app.evaluate(({ Menu }, itemLabel) => {
    const find = (menuItems: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const menuItem of menuItems) {
        if (menuItem.label === itemLabel) {
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

    /*
     * Clicked on the next tick rather than here. A command that navigates
     * rebuilds the application menu as it goes, and the item this call is
     * standing in — along with the reply it owes the test — goes with the menu
     * it belonged to, which reaches the runner as a collected promise. Letting
     * the reply leave first sidesteps that entirely.
     */
    if (menuItem) {
      setImmediate(() => {
        menuItem.click();
      });
    }

    return Boolean(menuItem);
  }, label);
}

test("the menu bar carries every top-level menu, in order", async () => {
  const topLevelLabels = await meru.app.evaluate(
    ({ Menu }) => Menu.getApplicationMenu()?.items.map((menuItem) => menuItem.label) ?? [],
  );

  /*
   * Written out and compared whole, not derived from the app and not filtered
   * down to what is expected. Deriving the list would leave nothing asserted —
   * the menus would be whatever the app says they are — and filtering lets a
   * menu bar grow a heading nobody reviewed. A menu bar is short and changes
   * deliberately, so adding to it should fail here until someone says so.
   */
  const expectedLabels = [
    "Meru",
    "File",
    "Edit",
    "View",
    "Message",
    "History",
    "Tabs",
    "Accounts",
    // Zoom and Bring All to Front are macOS-only roles, and a Window menu is a
    // macOS convention, so the whole menu ships there alone — ahead of Help.
    ...(process.platform === "darwin" ? ["Window"] : []),
    "Help",
  ];

  expect(topLevelLabels).toEqual(expectedLabels);
});

test("no two commands share an accelerator", async () => {
  const accelerators = (await readMenuItems())
    .map(({ accelerator }) => accelerator)
    .filter((accelerator) => accelerator !== null);

  const duplicates = accelerators.filter(
    (accelerator, index) => accelerators.indexOf(accelerator) !== index,
  );

  // Electron takes one of them and drops the other silently, so the command
  // that loses simply stops having a shortcut.
  expect(duplicates).toEqual([]);
});

test("the pinned tab shortcuts stay registered", async () => {
  const menuItems = await readMenuItems();

  /*
   * These nine are hidden in a packaged build and reachable only by their keys,
   * so nothing on screen would show they had gone. Ctrl is literal on every
   * platform here: Command+Shift+3 through 6 are macOS screenshot shortcuts
   * that never reach the app.
   */
  const pinnedTabAccelerators = menuItems
    .filter(({ label }) => label.startsWith("Select Pinned Tab"))
    .map(({ accelerator }) => accelerator);

  expect(pinnedTabAccelerators).toEqual([
    "Ctrl+Shift+1",
    "Ctrl+Shift+2",
    "Ctrl+Shift+3",
    "Ctrl+Shift+4",
    "Ctrl+Shift+5",
    "Ctrl+Shift+6",
    "Ctrl+Shift+7",
    "Ctrl+Shift+8",
    "Ctrl+Shift+9",
  ]);
});

test("a menu command drives the window", async () => {
  /*
   * Clicked through the main process rather than typed. A menu accelerator is
   * handled by Electron before the page ever sees the keys, and Playwright's
   * keyboard writes into the renderer's input pipeline, so pressing the keys
   * here would prove nothing about the menu. The keys themselves are covered by
   * asserting the accelerator each item carries.
   */
  expect(await clickMenuItem("Downloads")).toBe(true);

  await expect.poll(() => new URL(meru.renderer.url()).hash).toBe("#/download-history");

  expect(await clickMenuItem("Settings")).toBe(true);

  await expect.poll(() => new URL(meru.renderer.url()).hash).toBe("#/settings/general");
});

test("a command with nothing to act on is disabled", async () => {
  const menuItems = await readMenuItems();

  /*
   * Unified Inbox wants a valid license, the setting turned on and more than
   * one account, and the free version these tests run as has none of the three.
   * So this says an item can come up disabled and does — not which of the three
   * disabled it, which would need an app that satisfies the other two.
   */
  expect(menuItems.find(({ label }) => label === "Unified Inbox")?.enabled).toBe(false);

  // The other half of the claim: something unconditional stays enabled, so a
  // menu that came up dead all over would not read as this passing.
  expect(menuItems.find(({ label }) => label === "Downloads")?.enabled).toBe(true);
});
