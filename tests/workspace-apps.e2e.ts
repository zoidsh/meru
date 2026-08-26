/*
 * What the free version does not get of the workspace apps surface.
 *
 * The machinery itself — creating child views, laying them out, ordering them,
 * partitioning their sessions — is covered in
 * `tests/workspace-apps-pro.e2e.ts`, under the license workspace apps ship
 * behind. What is left here is the gate, asserted from the side a license does
 * not open.
 *
 * The pair is the point. Neither file keeps a list of what a license unlocks, so
 * a launcher that stopped being gated fails here, and one that stopped appearing
 * at all fails there.
 */
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";
import { waitForVerticalTabs } from "./lib/strip";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

const meru = useApp({
  /*
   * Seeded so that the launcher has apps to offer. Both hosts gate it on
   * `isLicenseKeyValid && launcherApps.length > 0`, and the default list is
   * empty — so without this the launcher would be absent for having nothing to
   * show, and the assertion below would hold with the license check deleted.
   */
  "workspaceApps.launcherApps": ["calendar", "tasks"],
  /*
   * And so that the strip is drawn at all. `getVerticalTabsWidth` gives it no
   * width for an account with a single tab, and a free account has exactly that
   * — the saved tabs that would make a second are a Pro feature. `sidebar` is
   * the one placement that keeps the strip for good, because it hands it the
   * launcher and the bookmarks button permanently.
   *
   * The alternative was seeding saved tabs here, which is the path this version
   * of the app wrongly allows without a license, and the one the todo has
   * against it. A gating test standing on a gating bug is not worth having.
   */
  "workspaceApps.launcherAndBookmarksPlacement": "sidebar",
  accounts: [seedAccount({ id: ACCOUNT_ID, label: "Default" })],
});

test("the workspace apps launcher is absent without a license", async () => {
  /*
   * The strip is waited for first, which is what makes the absence below a
   * decision the app made rather than a moment arriving too early. An earlier
   * version of this test asserted straight away and passed while the app was
   * showing the launcher — see `waitForVerticalTabs` for why this anchor and not
   * the bookmarks button beside it.
   */
  await waitForVerticalTabs(meru);

  await expect(meru.renderer.getByRole("button", { name: "Open app" })).toHaveCount(0);
});
