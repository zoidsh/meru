/*
 * Settings is the densest surface the tests can reach: nearly every route is
 * `ConfigSwitchField` and `ConfigSelectField` over a config key, and none of it
 * needs a Gmail account.
 *
 * Controls are addressed by their config key rather than by a test id. Both
 * field components pass the key as the control's `id` and label it with
 * `<key>-label`, so the key is already a stable handle and adding test ids
 * would only give the two somewhere to drift apart.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp();

/**
 * Every settings route, with the text its title renders. The list is written
 * out rather than read from `sidebarNavItems`, because importing the renderer's
 * own source would pull React through a runner that executes under Node.
 *
 * Languages is hidden from the sidebar on macOS but stays routable, so it is
 * checked on every platform.
 */
const SETTINGS_ROUTES = [
  ["/settings/general", "General"],
  ["/settings/accounts", "Accounts"],
  ["/settings/appearance", "Appearance"],
  ["/settings/blocker", "Blocker"],
  ["/settings/downloads", "Downloads"],
  ["/settings/gmail", "Gmail"],
  ["/settings/workspace-apps", "Workspace apps"],
  ["/settings/extensions", "Extensions"],
  ["/settings/languages", "Languages"],
  ["/settings/notifications", "Notifications"],
  ["/settings/phishing-protection", "Phishing protection"],
  ["/settings/saved-searches", "Saved searches"],
  ["/settings/unified-inbox", "Unified inbox"],
  ["/settings/updates", "Updates"],
  ["/settings/verification-codes", "Verification codes"],
  ["/settings/advanced", "Advanced"],
  ["/settings/license", "License"],
  ["/settings/version-history", "What's new"],
  ["/settings/about", "About Meru"],
] as const;

/** The switch a config key is rendered by, found through the label it points at. */
function configSwitch(configKey: string) {
  return meru.renderer.locator(`[aria-labelledby="${configKey}-label"]`);
}

test("every settings route renders", async () => {
  const rendererErrors: Error[] = [];

  meru.renderer.on("pageerror", (error) => {
    rendererErrors.push(error);
  });

  for (const [route, title] of SETTINGS_ROUTES) {
    await meru.goto(route);

    // Not toHaveText: Extensions carries a beta badge inside its title.
    await expect(meru.renderer.getByTestId("settings-title"), route).toContainText(title);
  }

  /*
   * Both field components throw when a key's value isn't the type they render —
   * a switch over a string, a select over a boolean. That throw takes the whole
   * route down at render time, which nothing but a run of the built app catches.
   */
  expect(rendererErrors.map((error) => error.stack ?? error.message)).toEqual([]);
});

test("a switch writes its key back to the config", async () => {
  await meru.goto("/settings/downloads");

  const saveAs = configSwitch("downloads.saveAs");

  await expect(saveAs).toBeVisible();

  expect((await meru.readConfig())["downloads.saveAs"]).toBe(false);

  await saveAs.click();

  // Polled against the file the main process writes, not the switch: what is
  // being proved is the round trip through IPC to disk, and the switch would
  // read as on either way.
  await expect.poll(async () => (await meru.readConfig())["downloads.saveAs"]).toBe(true);

  await saveAs.click();

  await expect.poll(async () => (await meru.readConfig())["downloads.saveAs"]).toBe(false);
});

test("a select behind a confirmation writes only once confirmed", async () => {
  await meru.goto("/settings/updates");

  const releaseChannel = meru.renderer.locator('[id="updates.channel"]');

  await releaseChannel.click();

  await meru.renderer.getByRole("option", { name: "Experimental" }).click();

  const confirmation = meru.renderer.getByRole("dialog");

  await expect(confirmation).toContainText("Switch to the experimental channel?");

  await confirmation.getByRole("button", { name: "Cancel" }).click();

  // The field goes on rendering the value from the config while the dialog is
  // open, so cancelling is meant to leave nothing to revert. Contained rather
  // than equal, because the trigger renders its own chevron alongside the value.
  await expect(releaseChannel).toContainText("Stable");

  expect((await meru.readConfig())["updates.channel"]).toBe("stable");

  await releaseChannel.click();

  await meru.renderer.getByRole("option", { name: "Experimental" }).click();

  // Changing the channel sends the updater off to check the new feed. That call
  // is fire and forget, and the app already makes one like it on every launch.
  await confirmation.getByRole("button", { name: "Switch to experimental" }).click();

  await expect.poll(async () => (await meru.readConfig())["updates.channel"]).toBe("alpha");
});

test("every field label points at its control", async () => {
  const labelledIds: string[] = [];

  for (const [route, title] of SETTINGS_ROUTES) {
    await meru.goto(route);

    // Waited on before reading the DOM. Every route is statically imported and
    // renders in the same task as the hash change today, so a scan would find
    // it anyway — but one lazily loaded route would have this reading the route
    // before it and reporting nothing at all.
    await expect(meru.renderer.getByTestId("settings-title"), route).toContainText(title);

    /*
     * A label naming an id nothing carries is a field whose text does not click
     * through to its control and which assistive technology reads as unlabelled.
     * It is also what the rest of these tests stand on, since they address a
     * control through the label that points at it.
     */
    const labels = await meru.renderer.locator("label[for]").evaluateAll((labelElements) =>
      labelElements.map((label) => ({
        labelledId: label.getAttribute("for") ?? "",
        resolves: Boolean(label.ownerDocument.getElementById(label.getAttribute("for") ?? "")),
      })),
    );

    expect(
      labels.filter(({ resolves }) => !resolves).map(({ labelledId }) => labelledId),
      route,
    ).toEqual([]);

    labelledIds.push(...labels.map(({ labelledId }) => labelledId));
  }

  // Guards the walk itself, the same way the gating walk does: labels that
  // stopped naming their control would leave nothing to check and read clean.
  expect(labelledIds).toContain("downloads.saveAs");
  expect(labelledIds).toContain("notifications.enabled");
});

test("every Pro-gated control is locked on the free version", async () => {
  const lockedKeys: string[] = [];

  for (const [route, title] of SETTINGS_ROUTES) {
    await meru.goto(route);

    // As above: read the route this loop is on, not the one before it.
    await expect(meru.renderer.getByTestId("settings-title"), route).toContainText(title);

    /*
     * The badge in a field's label is the claim that the field needs Meru Pro,
     * and the control being disabled is what makes the claim true. A field
     * shipped with one and not the other is the regression this catches, so the
     * two are read off the page together rather than from a list kept here.
     *
     * Both field components label their control by pointing at it, and so do
     * the hand-rolled fields, so `for` resolves to whatever actually holds the
     * disabled state — the hidden checkbox behind a switch, a select's trigger.
     */
    const gatedControls = await meru.renderer.locator("label[for]").evaluateAll((labels) =>
      labels
        .filter((label) => (label.textContent ?? "").includes("Meru Pro required"))
        .map((label) => {
          const labelledId = label.getAttribute("for") ?? "";

          return {
            labelledId,
            isDisabled: Boolean(
              label.ownerDocument.getElementById(labelledId)?.matches(":disabled"),
            ),
          };
        }),
    );

    for (const { labelledId, isDisabled } of gatedControls) {
      expect(isDisabled, `${route} — ${labelledId}`).toBe(true);

      lockedKeys.push(labelledId);
    }
  }

  // Guards the walk itself: a selector that stopped matching would otherwise
  // report every route clean.
  expect(lockedKeys).toContain("workspaceApps.openInApp");
  expect(lockedKeys).toContain("gmail.extendDarkTheme");
  expect(lockedKeys).toContain("unifiedInbox.enabled");
});
