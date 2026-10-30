/*
 * The selected account's view is the one on screen, with two accounts.
 *
 * The app takes the selected view out of the window and adds it back on every
 * switch, show and restore, which is how it reaches the front. An Electron
 * whose Chromium stacks a re-added view at the bottom on Linux
 * (electron/electron#54626) leaves it underneath the other account's: the
 * window shows the wrong account from launch and takes no input, while every
 * other test passes. Each test here is a step of the two-account check in the
 * project docs' `linux-vm.md`: launch, switching back and forth, minimize and
 * restore, and closing the window and launching again.
 *
 * Pro, because a second account is Pro. One account, the other half of the
 * same regression, is `account-view-visibility.e2e.ts`.
 */
import { test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { requireLicenseKey } from "./lib/app";
import { useUnattachedApp } from "./lib/unattached-app";
import {
  closeAndReopen,
  expectOnScreen,
  minimizeAndRestore,
  selectAccountFromMenu,
  waitForAccountViews,
} from "./lib/visibility";

const PERSONAL = { id: "first-account", label: "Personal" };

const WORK = { id: "second-account", label: "Work" };

const ACCOUNT_IDS = [PERSONAL.id, WORK.id];

const meru = useUnattachedApp({
  licenseKey: requireLicenseKey(),
  accounts: [seedAccount(PERSONAL), seedAccount({ ...WORK, selected: false })],
});

test.beforeEach(async () => {
  await waitForAccountViews(meru, ACCOUNT_IDS);
});

test("the selected account is on screen at launch", async () => {
  await expectOnScreen(meru, ACCOUNT_IDS, PERSONAL.id);
});

test("switching accounts puts the selected one on screen, both ways and repeatedly", async () => {
  for (let round = 0; round < 3; round++) {
    await selectAccountFromMenu(meru, WORK.label);

    await expectOnScreen(meru, ACCOUNT_IDS, WORK.id);

    await selectAccountFromMenu(meru, PERSONAL.label);

    await expectOnScreen(meru, ACCOUNT_IDS, PERSONAL.id);
  }
});

// With the second account selected, so the view restored is not the one that
// happened to be added last at launch.
test("the selected account is on screen after minimizing and restoring", async () => {
  await selectAccountFromMenu(meru, WORK.label);

  await expectOnScreen(meru, ACCOUNT_IDS, WORK.id);

  await minimizeAndRestore(meru, ACCOUNT_IDS);

  await expectOnScreen(meru, ACCOUNT_IDS, WORK.id);
});

test("the selected account is on screen after closing the window and launching again", async () => {
  await selectAccountFromMenu(meru, WORK.label);

  await expectOnScreen(meru, ACCOUNT_IDS, WORK.id);

  await closeAndReopen(meru, ACCOUNT_IDS);

  await expectOnScreen(meru, ACCOUNT_IDS, WORK.id);
});
