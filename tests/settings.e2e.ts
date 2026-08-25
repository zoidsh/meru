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
import { expect, type Locator, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp();

/** The switch a config key is rendered by, found through the label it points at. */
function configSwitch(configKey: string) {
  return meru.renderer.locator(`[aria-labelledby="${configKey}-label"]`);
}

/**
 * Every settings page, taken from the sidebar the app renders rather than from
 * a list kept here.
 *
 * A list kept here is a copy of `sidebarNavItems` that nothing keeps in step: a
 * page added to the app is simply never walked, and every test below reports
 * clean without having looked at it. What each page has to satisfy is still
 * written out below; only which pages exist comes from the app.
 *
 * Walking what the sidebar lists also means walking what anyone can reach.
 * Languages is hidden from the sidebar on macOS, so it goes uncovered there —
 * which is right, because there is no way to open it there either.
 */
async function readSettingsPageLabels(navigation: Locator) {
  const labels = await navigation.getByRole("button").allInnerTexts();

  /*
   * Guards the reading itself. A selector that stopped matching would hand
   * every walk an empty list, and each of them would pass having checked
   * nothing at all.
   */
  expect(labels).toEqual(
    expect.arrayContaining(["General", "Appearance", "Notifications", "License", "About Meru"]),
  );

  return labels;
}

/**
 * Opens a page from the sidebar and waits for it, which is what makes the walks
 * safe to read the DOM afterwards. The title is asserted against the label that
 * was clicked, so an item wired to the wrong page still fails.
 */
async function openSettingsPage(navigation: Locator, label: string) {
  await navigation.getByRole("button", { name: label, exact: true }).click();

  // Contained, not equal: Extensions carries a beta badge inside its title.
  await expect(meru.renderer.getByTestId("settings-title"), label).toContainText(label);
}

test("every settings page renders", async () => {
  const rendererErrors: Error[] = [];

  meru.renderer.on("pageerror", (error) => {
    rendererErrors.push(error);
  });

  const navigation = await meru.openSettings();

  for (const label of await readSettingsPageLabels(navigation)) {
    await openSettingsPage(navigation, label);
  }

  /*
   * Both field components throw when a key's value isn't the type they render —
   * a switch over a string, a select over a boolean. That throw takes the whole
   * route down at render time, which nothing but a run of the built app catches.
   */
  expect(rendererErrors.map((error) => error.stack ?? error.message)).toEqual([]);
});

test("a switch writes its key back to the config", async () => {
  await openSettingsPage(await meru.openSettings(), "Downloads");

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
  await openSettingsPage(await meru.openSettings(), "Updates");

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

  const navigation = await meru.openSettings();

  for (const label of await readSettingsPageLabels(navigation)) {
    // Opened and waited for before the DOM is read. Every page is statically
    // imported and renders in the same task as the navigation today, so a scan
    // would find it anyway — but one lazily loaded page would have this reading
    // the page before it and reporting nothing at all.
    await openSettingsPage(navigation, label);

    /*
     * A label naming an id nothing carries is a field whose text does not click
     * through to its control and which assistive technology reads as unlabelled.
     * It is also what the rest of these tests stand on, since they address a
     * control through the label that points at it.
     */
    const fieldLabels = await meru.renderer.locator("label[for]").evaluateAll((labelElements) =>
      labelElements.map((labelElement) => ({
        labelledId: labelElement.getAttribute("for") ?? "",
        resolves: Boolean(
          labelElement.ownerDocument.getElementById(labelElement.getAttribute("for") ?? ""),
        ),
      })),
    );

    // Soft, so one bad page reports and the walk carries on to the rest. The
    // navigation above stays hard: reading on past a page that never opened
    // would report the page before it, over and over.
    expect
      .soft(
        fieldLabels.filter(({ resolves }) => !resolves).map(({ labelledId }) => labelledId),
        label,
      )
      .toEqual([]);

    labelledIds.push(...fieldLabels.map(({ labelledId }) => labelledId));
  }

  // Guards the walk itself, the same way the gating walk does: labels that
  // stopped naming their control would leave nothing to check and read clean.
  expect(labelledIds).toContain("downloads.saveAs");
  expect(labelledIds).toContain("notifications.enabled");
});

test("every Pro-gated control is locked on the free version", async () => {
  const gatedGroups: string[] = [];

  const navigation = await meru.openSettings();

  for (const label of await readSettingsPageLabels(navigation)) {
    // As above: read the page this loop is on, not the one before it.
    await openSettingsPage(navigation, label);

    /*
     * The badge is the claim that a field needs Meru Pro, and its controls being
     * disabled is what makes the claim true. A field shipped with one and not
     * the other is the regression this catches, so the two are read off the page
     * together rather than from a list kept here.
     *
     * Found by the badge rather than by the label, because a badge sits in a
     * `FieldLabel`, a `FieldLegend`, a `FieldTitle` or an `ItemTitle` depending
     * on the field, and only the first of those is a `label`. Looking for labels
     * alone saw a third of them — mostly the ones rendered by the two wrapper
     * components, where badge and lock come from one expression and cannot
     * disagree. The hand-rolled fields it missed are the ones worth checking.
     */
    const gatedControls = await meru.renderer
      .getByText("Meru Pro required", { exact: true })
      .evaluateAll((badges) =>
        badges.map((badge) => {
          const group = badge.closest(
            '[data-slot="field"], [data-slot="field-set"], [data-slot="item"]',
          );

          /*
           * Only what can carry a disabled state. A span never matches
           * `:disabled`, so asserting on one would always read as unlocked.
           *
           * Typed off the badge rather than as an `Element`, because the runner
           * compiles without the DOM library and `querySelectorAll` comes back
           * as `unknown` there.
           */
          const controls = group
            ? (Array.from(
                group.querySelectorAll("input, button, select, textarea"),
              ) as (typeof badge)[])
            : [];

          return {
            field: (group?.textContent ?? "").trim().slice(0, 60),
            usable: controls
              .filter((control) => !control.matches(":disabled"))
              .map((control) => (control.textContent ?? "").trim()),
          };
        }),
      );

    for (const { field, usable } of gatedControls) {
      // Soft, so every gated field on the page reports rather than only the
      // first one to fail.
      expect.soft(usable, `${label} — ${field}`).toEqual([]);

      gatedGroups.push(field);
    }
  }

  /*
   * Guards the walk itself: a badge that stopped matching would leave every page
   * with nothing to check and report clean. The count is asserted loosely, since
   * the point is that gated fields were found at all, not how many there are.
   */
  expect(gatedGroups.length).toBeGreaterThan(30);
});
