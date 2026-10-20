/*
 * The interface language: what the picker offers, what it writes, the restart
 * it asks for, and the `lang` every renderer page carries at first paint.
 *
 * Seeded with `"system"` rather than the `"en"` every other launch takes, so
 * that picking English is a change the config has to record. English is the
 * only catalog this build ships, so the system resolution lands there too and
 * nothing here depends on the machine's own languages.
 */
import { expect, type Page, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

const meru = useApp({ "app.language": "system" });

function readDocumentLanguage(page: Page) {
  return page.evaluate(() => document.documentElement.lang);
}

test("the language field offers the shipped languages, writes the one picked and asks for a restart", async () => {
  await openSettingsPage(meru, await meru.openSettings(), "General");

  const language = meru.renderer.locator('[id="app.language"]');

  // Contained rather than equal, because the trigger renders its own chevron
  // alongside the value.
  await expect(language).toContainText("System");

  await language.click();

  await expect(meru.renderer.getByRole("option", { name: "System" })).toBeVisible();

  const english = meru.renderer.getByRole("option", { name: "English" });

  await expect(english).toBeVisible();

  await english.click();

  // Polled against the file the main process writes, not the trigger: what is
  // proved is the round trip through IPC to disk.
  await expect.poll(async () => (await meru.readConfig())["app.language"]).toBe("en");

  await expect(language).toContainText("English");

  const restartRequired = meru.renderer
    .getByRole("listitem")
    .filter({ hasText: "Restart Meru to apply the changes." });

  await expect(restartRequired).toBeVisible();

  await expect(restartRequired.getByRole("button", { name: "Restart" })).toBeVisible();

  await restartRequired.getByRole("button", { name: "Later" }).click();

  await expect(restartRequired).toBeHidden();
});

test("every renderer page carries the active language", async () => {
  await expect.poll(() => readDocumentLanguage(meru.renderer)).toBe("en");

  // A popup is its own page, loaded when it opens, so it takes the language
  // from the search parameters `loadRenderer` puts there rather than from the
  // page that opened it.
  const openingPopup = meru.app.waitForEvent("window", (window) =>
    window.url().includes("recent-download-history.html"),
  );

  await meru.renderer.getByTitle("Show recent download history").click();

  const popup = await openingPopup;

  await expect.poll(() => readDocumentLanguage(popup)).toBe("en");
});
