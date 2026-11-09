/*
 * The Do Not Disturb button and the setting that takes it out of the titlebar.
 *
 * Under a license, because Do Not Disturb is Pro: the titlebar renders the
 * button only on a valid key, so a free-version run has nothing here to assert
 * on either way.
 *
 * The switch is driven from the settings page rather than seeded, because what
 * is being proved is that the titlebar follows it live — a seeded value would
 * only say the first paint read the key, which was never in doubt. Turning the
 * button off is also what asks the main process to turn Do Not Disturb off with
 * it, and that happens on the change and nowhere else.
 */
import { expect, test } from "@playwright/test";
import { useProApp } from "./lib/app";
import { configSwitch, openSettingsPage } from "./lib/settings";

const meru = useProApp();

/**
 * Flips Show Do Not Disturb button from the settings page and comes back to the
 * titlebar, having waited for the write.
 *
 * The config on disk is polled before settings is closed, so a failure
 * afterwards is the titlebar and not a write that had yet to land.
 */
async function setShowDoNotDisturbButton(shown: boolean) {
  const settings = await meru.openSettings();

  await openSettingsPage(settings, "Appearance");

  await configSwitch(settings, "doNotDisturb.showTitlebarButton").click();

  await expect
    .poll(async () => (await meru.readConfig())["doNotDisturb.showTitlebarButton"])
    .toBe(shown);

  await meru.closeSettings();
}

test("the Do Not Disturb button follows its setting, and turns Do Not Disturb off when hidden", async () => {
  // Found by the title it toggles between, which is what a user reads off it
  // and the only thing distinguishing it from the other icon buttons beside it.
  const doNotDisturbButton = meru.renderer.getByRole("button", {
    name: /Turn Do Not Disturb (on|off)/,
  });

  await expect(doNotDisturbButton).toHaveCount(1);

  await doNotDisturbButton.click();

  await expect.poll(async () => (await meru.readConfig())["doNotDisturb.enabled"]).toBe(true);

  await setShowDoNotDisturbButton(false);

  await expect(doNotDisturbButton).toHaveCount(0);

  await expect.poll(async () => (await meru.readConfig())["doNotDisturb.enabled"]).toBe(false);

  await setShowDoNotDisturbButton(true);

  await expect(doNotDisturbButton).toHaveCount(1);

  /*
   * Bringing the button back is not bringing Do Not Disturb back: what was
   * turned off stays off, and the button comes back reading Turn Do Not
   * Disturb on.
   */
  expect((await meru.readConfig())["doNotDisturb.enabled"]).toBe(false);
});
