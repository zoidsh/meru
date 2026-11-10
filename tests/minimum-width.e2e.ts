/*
 * Settings at its window's minimum width.
 *
 * Every page has to fit it, switches included, since a column sized for the
 * width the window opens at runs under the window's right edge there.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { readPageMisfits, setMinimumWindowWidth } from "./lib/page-fit";
import { openSettingsPage, readSettingsPageLabels } from "./lib/settings";

const meru = useApp();

test("every settings page fits the window at its minimum width", async () => {
  const settings = await meru.openSettings();

  const windowWidth = await setMinimumWindowWidth(meru, settings);

  const findings: string[] = [];

  for (const label of await readSettingsPageLabels(settings)) {
    await openSettingsPage(settings, label);

    for (const misfit of await readPageMisfits(settings)) {
      findings.push(`${windowWidth}px "${label}": ${misfit}`);
    }
  }

  expect(findings).toEqual([]);
});
