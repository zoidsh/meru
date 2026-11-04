/*
 * A single account's view stays on screen.
 *
 * The view the app re-adds on every show and restore can come back underneath
 * the window's own page, on an Electron whose Chromium stacks a re-added view at
 * the bottom on Linux (electron/electron#54626). Gmail then stays blank from
 * launch, and again after the window is closed and reopened. Two accounts are
 * in `account-view-visibility-pro.e2e.ts`.
 */
import { test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useUnattachedApp } from "./lib/unattached-app";
import {
  closeAndReopen,
  expectOnScreen,
  minimizeAndRestore,
  waitForAccountViews,
} from "./lib/visibility";

const ACCOUNT_ID = "only-account";

const meru = useUnattachedApp({
  accounts: [seedAccount({ id: ACCOUNT_ID, label: "Personal" })],
});

test.beforeEach(async () => {
  await waitForAccountViews(meru, [ACCOUNT_ID]);
});

test("the account is on screen at launch", async () => {
  await expectOnScreen(meru, [ACCOUNT_ID], ACCOUNT_ID);
});

test("the account is on screen after minimizing and restoring", async () => {
  await minimizeAndRestore(meru, [ACCOUNT_ID]);

  await expectOnScreen(meru, [ACCOUNT_ID], ACCOUNT_ID);
});

test("the account is on screen after closing the window and launching again", async () => {
  await closeAndReopen(meru, [ACCOUNT_ID]);

  await expectOnScreen(meru, [ACCOUNT_ID], ACCOUNT_ID);
});
