/*
 * The spellchecker's languages, as the account's session holds them, for a
 * free user.
 *
 * Read straight out of the partition in the main process, so the claim is what
 * the session checks spelling in, whatever the settings page shows. What the
 * session holds with nothing written to it comes from a partition no account
 * uses, since that default follows the locale the app was launched in.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { type MeruApp, useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

const ACCOUNT_ID = "spellchecker-account";

// At file scope rather than in a hook, as in `deep-link.e2e.ts`, so the app is
// never launched for a test that is skipped.
test.skip(
  process.platform === "darwin",
  "macOS checks spelling with the system's spellchecker, and Electron ignores the session's languages there",
);

function readSpellCheckerLanguages(meru: MeruApp, partition: string) {
  return meru.app.evaluate(
    ({ session }, partition) => session.fromPartition(partition).getSpellCheckerLanguages(),
    partition,
  );
}

function readDefaultSpellCheckerLanguages(meru: MeruApp) {
  return readSpellCheckerLanguages(meru, `persist:fresh-${randomUUID()}`);
}

function readAccountSpellCheckerLanguages(meru: MeruApp) {
  return readSpellCheckerLanguages(meru, `persist:${ACCOUNT_ID}`);
}

test.describe("with German as an additional language", () => {
  const meru = useApp({
    accounts: [seedAccount({ id: ACCOUNT_ID, label: "Personal" })],
    "spellchecker.languages": ["de"],
  });

  test("the account's session checks the system language and German", async () => {
    const defaultLanguages = await readDefaultSpellCheckerLanguages(meru);

    await expect
      .poll(() => readAccountSpellCheckerLanguages(meru))
      .toEqual([...defaultLanguages, "de"]);
  });

  test("removing German leaves the system language alone", async () => {
    const defaultLanguages = await readDefaultSpellCheckerLanguages(meru);

    await expect
      .poll(() => readAccountSpellCheckerLanguages(meru))
      .toEqual([...defaultLanguages, "de"]);

    const settings = await meru.openSettings();

    await openSettingsPage(settings, "Languages");

    await settings.getByRole("button", { name: "German", exact: true }).click();

    await settings.getByRole("menuitemcheckbox", { name: "German", exact: true }).click();

    await expect.poll(async () => (await meru.readConfig())["spellchecker.languages"]).toEqual([]);

    await expect.poll(() => readAccountSpellCheckerLanguages(meru)).toEqual(defaultLanguages);
  });
});

test.describe("in a locale with no dictionary", () => {
  const meru = useApp(
    {
      accounts: [seedAccount({ id: ACCOUNT_ID, label: "Personal" })],
      "spellchecker.languages": ["de"],
    },
    { args: ["--lang=ja"] },
  );

  test("the app starts and the account's session checks German alone", async () => {
    await expect(meru.renderer.locator("#root > *").first()).toBeAttached();

    await expect.poll(() => readAccountSpellCheckerLanguages(meru)).toEqual(["de"]);
  });
});
