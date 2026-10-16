/*
 * Spike: the Lingui macro, compiled into the production main bundle by
 * rolldown, read back out of the running app. The menu is where it matters —
 * what the OS draws is not assertable, but the menu Electron was handed is.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp({}, { env: { MERU_LOCALE: "de" } });

function readMenuLabels() {
  return meru.app.evaluate(({ Menu }) => {
    const labels: string[] = [];

    const collect = (menuItems: Electron.MenuItem[]) => {
      for (const menuItem of menuItems) {
        labels.push(menuItem.label);

        if (menuItem.submenu) {
          collect(menuItem.submenu.items);
        }
      }
    };

    collect(Menu.getApplicationMenu()?.items ?? []);

    return labels;
  });
}

test("the menu and a settings label come up in German", async () => {
  expect(await readMenuLabels()).toContain("Einstellungen");

  // The trial is seeded as over, so the count is zero and the plural selects
  // `other` in both catalogs.
  expect(await readMenuLabels()).toContain("0 Tage in deiner Testphase übrig");

  expect(await meru.runMenuCommand("Einstellungen")).toBe(true);

  const renderer = meru.renderer;

  await expect(renderer.getByText("Beim Anmelden starten")).toBeVisible();
});

test("a dialog is handed the German strings", async () => {
  // What the OS draws in a native dialog is not assertable, so the options the
  // dialog is called with are read instead.
  await meru.app.evaluate(({ dialog }) => {
    const captured: Electron.MessageBoxOptions[] = [];

    Reflect.set(globalThis, "capturedDialogs", captured);

    dialog.showMessageBox = ((...args: unknown[]) => {
      captured.push(args.at(-1) as Electron.MessageBoxOptions);

      return Promise.resolve({ response: 1, checkboxChecked: false });
    }) as typeof dialog.showMessageBox;
  });

  expect(await meru.runMenuCommand("Spike: show restart dialog")).toBe(true);

  await expect
    .poll(() =>
      meru.app.evaluate(
        () => (Reflect.get(globalThis, "capturedDialogs") as Electron.MessageBoxOptions[])[0],
      ),
    )
    .toMatchObject({
      message: "Starte Meru neu, um die Änderungen zu übernehmen.",
      buttons: ["Neu starten", "Später"],
    });
});

test("switching the locale rebuilds the menu", async () => {
  expect(await readMenuLabels()).toContain("Einstellungen");

  expect(await meru.runMenuCommand("Spike: switch to en")).toBe(true);

  await expect.poll(async () => await readMenuLabels()).toContain("Settings");

  expect(await readMenuLabels()).toContain("0 days left in your trial");

  expect(await readMenuLabels()).not.toContain("Einstellungen");
});
