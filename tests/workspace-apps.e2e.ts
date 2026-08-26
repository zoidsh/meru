/*
 * What the free version does not get of the workspace apps surface.
 *
 * The machinery itself — creating child views, laying them out, ordering them,
 * partitioning their sessions — is covered in
 * `tests/workspace-apps-pro.e2e.ts`, under the license workspace apps ship
 * behind. What is left here is the gate, asserted from the side a license does
 * not open: the launcher that offers an app, and the saved tabs and bookmarks
 * that a trial leaves behind when it ends.
 *
 * The pair is the point. Neither file keeps a list of what a license unlocks, so
 * a launcher that stopped being gated fails here, and one that stopped appearing
 * at all fails there.
 */
import { expect, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useApp } from "./lib/app";
import { startTestServer, type TestServer } from "./lib/server";
import { waitForVerticalTabs } from "./lib/strip";
import { readViews } from "./lib/views";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

/** The saved tab seeded with `loadOnLaunch`, which startup would restore into a live view. */
const LAUNCH_TAB_TITLE = "Restored";

/** The saved tab seeded without it, which would come back as an entry in the strip. */
const DORMANT_TAB_TITLE = "Keep";

let server: TestServer;

test.beforeAll(async () => {
  server = await startTestServer();
});

test.afterAll(async () => {
  await server.close();
});

/*
 * A function rather than an object, because the port the server ends up on
 * cannot be named while this file is being read.
 */
const meru = useApp(() => ({
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
   * — the saved tabs seeded below are refused, which is what this file asserts,
   * so they cannot be what makes a second. `sidebar` is the one placement that
   * keeps the strip for good, because it hands it the launcher and the
   * bookmarks button permanently.
   */
  "workspaceApps.launcherAndBookmarksPlacement": "sidebar",
  accounts: [
    seedAccount({
      id: ACCOUNT_ID,
      label: "Default",
      /*
       * A trial's pinned tabs, as they sit in the config on the launch after it
       * ended. Both kinds, because they arrive by different paths:
       * `loadLaunchTabs` materializes the first during startup, and the second
       * waits in the strip for a click to wake it. Neither was gated, so a
       * trial user kept their workspace apps working indefinitely.
       */
      savedTabs: [
        seedSavedTab({
          app: "calendar",
          url: server.pageUrl(LAUNCH_TAB_TITLE),
          title: "Calendar",
          loadOnLaunch: true,
        }),
        seedSavedTab({
          app: "keep",
          url: server.pageUrl(DORMANT_TAB_TITLE),
          title: DORMANT_TAB_TITLE,
        }),
      ],
    }),
  ],
}));

/**
 * Resolves once startup has passed the point where a saved tab would have been
 * restored.
 *
 * `accounts.createViews` awaits every account's Gmail view and then, with
 * nothing awaited in between, runs `loadLaunchTabs`. So a child view that has
 * finished loading is proof the launch tabs have already been dealt with —
 * which is what makes the absences below a decision the app made rather than a
 * moment that has not arrived yet. The same trap as `waitForVerticalTabs`, on
 * the other side of the window.
 *
 * The view is not named by its URL, because the account's is Gmail's sign-in
 * page rather than Gmail: nobody is signed in here, and matching on the Gmail
 * URL waits for a page that never arrives.
 */
async function waitForLaunchTabs() {
  await expect
    .poll(async () => (await readViews(meru)).some((view) => view.url !== "" && !view.isLoading))
    .toBe(true);
}

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

test("saved tabs are not restored without a license", async () => {
  await waitForLaunchTabs();

  /*
   * Counted by origin rather than by the one URL, so a launch tab that loaded
   * and a dormant one that was woken are both caught. The account's Gmail view
   * is the only child the window should have.
   */
  const restoredViews = (await readViews(meru)).filter((view) =>
    view.url.startsWith(server.origin),
  );

  expect(restoredViews).toHaveLength(0);

  // And neither saved tab holds a place in the strip, which is the other half:
  // a tab listed and refused on click would pass the assertion above.
  await waitForVerticalTabs(meru);

  await expect(meru.renderer.getByRole("button", { name: LAUNCH_TAB_TITLE })).toHaveCount(0);

  await expect(
    meru.renderer.getByRole("button", { name: DORMANT_TAB_TITLE, exact: true }),
  ).toHaveCount(0);
});
