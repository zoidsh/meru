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
 * Settings pages the app has but does not list, with the text their title
 * renders. Languages is hidden from the sidebar on macOS and stays routable, so
 * walking what is listed would stop covering it there.
 *
 * Anything reachable from the sidebar belongs in the sidebar, not here.
 */
const UNLISTED_PAGES = [["/settings/languages", "Languages"]] as const;

/** The switch a config key is rendered by, found through the label it points at. */
function configSwitch(configKey: string) {
  return meru.renderer.locator(`[aria-labelledby="${configKey}-label"]`);
}

type SettingsPage = { label: string; open: () => Promise<void> };

/**
 * Every settings page, taken from the sidebar the app renders rather than from
 * a list kept here.
 *
 * A list kept here is a copy of `sidebarNavItems` that nothing keeps in step: a
 * page added to the app is simply never walked, and every test below reports
 * clean without having looked at it. Reading the sidebar costs the walk its
 * page-by-page route assertions, and buys coverage that arrives on its own —
 * which for a surface that grows is the better trade. What each page has to
 * satisfy is still written out below; only which pages exist comes from the app.
 */
async function readSettingsPages(): Promise<SettingsPage[]> {
  // The sidebar only renders on a settings route, so there has to be one open
  // before there is anything to read.
  await meru.goto("/settings/general");

  const navigation = meru.renderer.getByTestId("settings-nav");

  await expect(navigation).toBeVisible();

  const labels = await navigation.getByRole("button").allInnerTexts();

  const pages: SettingsPage[] = labels.map((label) => ({
    label,
    open: async () => {
      await navigation.getByRole("button", { name: label, exact: true }).click();
    },
  }));

  for (const [route, label] of UNLISTED_PAGES) {
    if (!labels.includes(label)) {
      pages.push({ label, open: () => meru.goto(route) });
    }
  }

  /*
   * Guards the reading itself. A selector that stopped matching would hand
   * every walk an empty list, and each of them would pass having checked
   * nothing at all.
   */
  expect(pages.map(({ label }) => label)).toEqual(
    expect.arrayContaining(["General", "Appearance", "Notifications", "License", "About Meru"]),
  );

  return pages;
}

/**
 * Opens a page and waits for it, which is what makes the walks safe to read the
 * DOM afterwards. The title is asserted against the sidebar's own label for the
 * page, so an item wired to the wrong route still fails.
 */
async function openSettingsPage({ label, open }: SettingsPage) {
  await open();

  // Contained, not equal: Extensions carries a beta badge inside its title.
  await expect(meru.renderer.getByTestId("settings-title"), label).toContainText(label);
}

test("every settings page renders", async () => {
  const rendererErrors: Error[] = [];

  meru.renderer.on("pageerror", (error) => {
    rendererErrors.push(error);
  });

  for (const page of await readSettingsPages()) {
    await openSettingsPage(page);
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

  for (const page of await readSettingsPages()) {
    // Opened and waited for before the DOM is read. Every page is statically
    // imported and renders in the same task as the navigation today, so a scan
    // would find it anyway — but one lazily loaded page would have this reading
    // the page before it and reporting nothing at all.
    await openSettingsPage(page);

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
      page.label,
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

  for (const page of await readSettingsPages()) {
    // As above: read the page this loop is on, not the one before it.
    await openSettingsPage(page);

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
      expect(isDisabled, `${page.label} — ${labelledId}`).toBe(true);

      lockedKeys.push(labelledId);
    }
  }

  // Guards the walk itself: a selector that stopped matching would otherwise
  // report every route clean.
  expect(lockedKeys).toContain("workspaceApps.openInApp");
  expect(lockedKeys).toContain("gmail.extendDarkTheme");
  expect(lockedKeys).toContain("unifiedInbox.enabled");
});
