/*
 * The first account's label on a fresh install in German.
 *
 * The default config stores the label in English, and it stays that way on
 * disk, so the claims are about what is drawn from it and about what is left
 * in the config afterwards.
 *
 * The German word is read from the compiled German catalog rather than written
 * here, so the translation can change without this test. The strings the test
 * navigates by are German because the whole interface is.
 */
import { setupI18n } from "@lingui/core";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { messages } from "@meru/shared/i18n/locales/de";
import { expect, type Page, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

const meru = useApp({ "app.language": "de" });

const germanDefaultLabel = setupI18n({ locale: "de", messages: { de: messages } })._({
  id: generateMessageId("Default", "account label"),
  message: "Default",
});

async function openAccountsSettings() {
  // The German item takes a no-break space before its ellipsis, on every platform.
  expect(await meru.runMenuCommand("Einstellungen\u00a0…")).toBe(true);

  await expect
    .poll(() => meru.app.windows().some((page) => page.url().includes("settings.html")))
    .toBe(true);

  const settings = meru.app.windows().find((page) => page.url().includes("settings.html")) as Page;

  await expect(settings.getByTestId("settings-nav")).toBeVisible();

  await openSettingsPage(settings, "Konten");

  return {
    settings,
    accountItems: settings.locator('[data-slot="item-group"] [data-slot="item"]'),
  };
}

async function readStoredLabel() {
  return (await meru.readConfig()).accounts?.[0]?.label;
}

test("Settings and the Accounts menu name the first account in German and the config keeps it in English", async () => {
  const { accountItems } = await openAccountsSettings();

  const title = accountItems.locator('[data-slot="item-title"]');

  await expect(title).not.toHaveText("Default");

  await expect(title).toHaveText(germanDefaultLabel);

  const accountMenuLabels = await meru.app.evaluate(
    ({ Menu }) =>
      Menu.getApplicationMenu()
        ?.items.find((menuItem) => menuItem.label === "Konten")
        ?.submenu?.items.map((menuItem) => menuItem.label) ?? [],
  );

  expect(accountMenuLabels).toContain(germanDefaultLabel);
  expect(accountMenuLabels).not.toContain("Default");

  expect(await readStoredLabel()).toBe("Default");
});

test("saving the edit dialog untouched leaves the stored label in English", async () => {
  const { settings, accountItems } = await openAccountsSettings();

  await accountItems.getByRole("button", { name: "Konto bearbeiten" }).click();

  const dialog = settings.getByRole("dialog");

  const labelField = dialog.locator('input[name="label"]');

  await expect(labelField).toHaveValue(germanDefaultLabel);

  // The color changes along with the save so that the poll waits for the write
  // itself. A label that is already "Default" would pass before it lands.
  await dialog.locator("#color").click();

  await settings.getByRole("option", { name: "Orange" }).click();

  await dialog.getByRole("button", { name: "Speichern" }).click();

  await expect(dialog).toHaveCount(0);

  await expect
    .poll(async () => {
      const account = (await meru.readConfig()).accounts?.[0];

      return [account?.color, account?.label];
    })
    .toEqual(["orange", "Default"]);

  await accountItems.getByRole("button", { name: "Konto bearbeiten" }).click();

  await labelField.fill("Arbeit");

  await dialog.getByRole("button", { name: "Speichern" }).click();

  await expect.poll(readStoredLabel).toBe("Arbeit");

  await expect(accountItems.locator('[data-slot="item-title"]')).toHaveText("Arbeit");
});
