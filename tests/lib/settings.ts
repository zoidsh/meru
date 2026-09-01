/*
 * Walking the settings pages, shared by the suites that assert on them.
 *
 * Both entitlements walk the same routes and differ only in what they expect to
 * find, so the walk itself lives here rather than in either of them.
 */
import { expect, type Locator } from "@playwright/test";
import type { MeruApp } from "./app";

/**
 * Every settings page, taken from the sidebar the app renders rather than from
 * a list kept here.
 *
 * A list kept here is a copy of `sidebarNavItems` that nothing keeps in step: a
 * page added to the app is simply never walked, and every caller reports clean
 * without having looked at it. What each page has to satisfy stays with the
 * test; only which pages exist comes from the app.
 *
 * Walking what the sidebar lists also means walking what anyone can reach.
 * Languages is hidden from the sidebar on macOS, so it goes uncovered there —
 * which is right, because there is no way to open it there either.
 */
export async function readSettingsPageLabels(navigation: Locator) {
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
export async function openSettingsPage(meru: MeruApp, navigation: Locator, label: string) {
  await navigation.getByRole("button", { name: label, exact: true }).click();

  // Contained, not equal: Extensions carries a maturity badge inside its title.
  await expect(meru.renderer.getByTestId("settings-title"), label).toContainText(label);
}
