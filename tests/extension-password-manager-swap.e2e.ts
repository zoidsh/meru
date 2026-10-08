/*
 * One password manager at a time, from the Extensions settings page: turning
 * one on while the other is installed asks first, and replacing it leaves the
 * config listing only the new one.
 *
 * The launch carries `MERU_EXTENSIONS_FIXTURE`, under which an install records
 * the opt-in without downloading anything, since no package here is signed for
 * a curated id. Bitwarden is seeded as installed by its opt-in alone, so there
 * is nothing on disk for the loader to load either. `useProApp` because
 * installing is Pro, and the master switch is seeded on because the switches
 * lock without it.
 */
import { BITWARDEN_EXTENSION_ID, ONEPASSWORD_EXTENSION_ID } from "@meru/shared/extensions";
import { expect, test } from "@playwright/test";
import { useProApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

const meru = useProApp(
  { "extensions.enabled": true, "extensions.installed": [BITWARDEN_EXTENSION_ID] },
  { env: { MERU_EXTENSIONS_FIXTURE: "1" } },
);

function extensionSwitch(name: string) {
  return meru.renderer.getByRole("switch", { name: `Install ${name}` });
}

async function readInstalledExtensionIds() {
  return (await meru.readConfig())["extensions.installed"];
}

test("turning on a second password manager asks first, and replacing turns the other off", async () => {
  await openSettingsPage(meru, await meru.openSettings(), "Extensions");

  await expect(extensionSwitch("Bitwarden")).toBeChecked();

  await expect(extensionSwitch("1Password")).not.toBeChecked();

  await extensionSwitch("1Password").click();

  const replaceBitwarden = meru.renderer.getByRole("alertdialog", {
    name: "Replace Bitwarden with 1Password?",
  });

  await expect(replaceBitwarden).toBeVisible();

  await expect(replaceBitwarden).toContainText(
    "Only one password manager can be on at a time. Turning on 1Password turns off Bitwarden in Meru and signs you out of it here. Your passwords stay in your Bitwarden account.",
  );

  // Cancel is the default, so the safe answer is the one Return gives
  await expect(replaceBitwarden.getByRole("button", { name: "Cancel" })).toBeFocused();

  await meru.renderer.keyboard.press("Enter");

  await expect(replaceBitwarden).toBeHidden();

  await expect(extensionSwitch("Bitwarden")).toBeChecked();

  await expect(extensionSwitch("1Password")).not.toBeChecked();

  expect(await readInstalledExtensionIds()).toEqual([BITWARDEN_EXTENSION_ID]);

  await extensionSwitch("1Password").click();

  await replaceBitwarden.getByRole("button", { name: "Replace" }).click();

  // What follows any 1Password install, a swap included
  await expect(meru.renderer.getByRole("dialog", { name: "Connect 1Password" })).toBeVisible();

  await expect.poll(readInstalledExtensionIds).toEqual([ONEPASSWORD_EXTENSION_ID]);

  // The setup dialog is modal, so the switches behind it are out of reach until it closes
  await meru.renderer.getByRole("button", { name: "Later" }).click();

  await expect(extensionSwitch("Bitwarden")).not.toBeChecked();

  await expect(extensionSwitch("1Password")).toBeChecked();

  await extensionSwitch("Bitwarden").click();

  const replaceOnePassword = meru.renderer.getByRole("alertdialog", {
    name: "Replace 1Password with Bitwarden?",
  });

  await expect(replaceOnePassword).toContainText(
    "Only one password manager can be on at a time. Turning on Bitwarden turns off 1Password in Meru and signs you out of it here. Your passwords stay in your 1Password account.",
  );

  await replaceOnePassword.getByRole("button", { name: "Replace" }).click();

  // And what follows any other install
  await expect(meru.renderer.getByText("Restart Meru to apply the changes.")).toBeVisible();

  await expect.poll(readInstalledExtensionIds).toEqual([BITWARDEN_EXTENSION_ID]);

  await expect(extensionSwitch("Bitwarden")).toBeChecked();

  await expect(extensionSwitch("1Password")).not.toBeChecked();
});
