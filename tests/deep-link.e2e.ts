/*
 * The free version's side of the `meru://open?url=…` route: it does nothing.
 *
 * `handleMeruUrl` gates on `licenseKey.isValid` before it so much as parses the
 * URL, so a link that would open a view under a license opens none here. That
 * flag is set only by a successful API response and no config key fakes it,
 * which is what makes this the inverse of `tests/deep-link-pro.e2e.ts` rather
 * than a second copy of it — and why the two are separate files, `useApp` being
 * called at module scope.
 *
 * Asserted on views alone. The gate's other half is a native Pro upgrade dialog
 * from `showProUpgradeDialog`, and nothing in this suite can see a native
 * message box — no test observes one today, and reaching into `dialog` from the
 * main process would be asserting against a stub of the thing under test.
 */
import { ms } from "@meru/shared/ms";
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";
import { sendDeepLink } from "./lib/deep-link";
import { readViews } from "./lib/views";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

const MEET_DEEP_LINK = `meru://open?url=${encodeURIComponent("https://meet.google.com/abc-defg-hij")}`;

const meru = useApp({
  accounts: [seedAccount({ id: ACCOUNT_ID, label: "Personal" })],
  // The same seed the Pro file makes its positive claim under, so the only
  // difference between the two outcomes is the license.
  "workspaceApps.openInApp": true,
  "workspaceApps.mode": "tabs",
});

// At file scope rather than in a hook, as in `native-resize.e2e.ts`: the
// harness above registers its `beforeEach` first, and hooks run in registration
// order, so skipping from inside one would launch the app before deciding not
// to use it.
test.skip(
  process.platform === "darwin",
  "macOS delivers a meru:// URL through open-url to the running app, which spawning the executable cannot reach",
);

test("meru://open opens nothing without a license", async () => {
  const viewCountBefore = (await readViews(meru)).length;

  await sendDeepLink(meru, MEET_DEEP_LINK);

  // Fixed rather than polled: there is no state to poll towards when the claim
  // is that nothing happens. The Pro file measures the delivery this covers.
  await meru.renderer.waitForTimeout(ms("5s"));

  const views = await readViews(meru);

  expect(views).toHaveLength(viewCountBefore);

  expect(views.filter((view) => view.url.startsWith("https://meet.google.com"))).toEqual([]);
});
