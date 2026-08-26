/*
 * The child `WebContentsView` machinery, which is what the app is built out of.
 *
 * A Gmail account is one of these views and every workspace app is another, so
 * creating them, laying them out, keeping them in the right order and running
 * each in the right session is the mechanism nearly every feature sits on. None
 * of it is reachable below this level: a component test cannot construct a
 * `WebContentsView` at all, and a screenshot cannot see one, because the
 * compositor paints them above the renderer's HTML and they come out blank.
 *
 * What a view loads is served from this machine — see `tests/lib/server.ts` for
 * why. The view, its session and its layout are all the app's own.
 *
 * `tests/workspace-apps-pro.e2e.ts` carries the half of this that needs a
 * license: the launcher, and two accounts kept in separate sessions.
 */
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { APP_TITLEBAR_HEIGHT, VERTICAL_TABS_NARROW_WIDTH } from "@meru/shared/constants";
import { expect, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useApp } from "./lib/app";
import { DOWNLOAD_BODY, DOWNLOAD_FILE_NAME, startTestServer, type TestServer } from "./lib/server";
import { waitForVerticalTabs } from "./lib/strip";
import { findViewByUrl, readUnfilledSpace, readViews } from "./lib/views";

/*
 * Fixed rather than generated, because the account's session is partitioned on
 * it: a literal here is what the storage path below is asserted against, and a
 * generated one would leave that assertion comparing the app to itself.
 */
const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

/** The saved tab seeded with `loadOnLaunch`, so startup brings it back as a live view. */
const RESTORED_TAB_TITLE = "Calendar";

/** The saved tab seeded without it, so it comes back as an entry with nothing behind it. */
const DORMANT_TAB_TITLE = "Keep";

/*
 * What the served pages are titled, deliberately not the workspace app labels
 * above. `WorkspaceApp.resolveTitle` falls back to the app's label when no page
 * title ever arrives, so a page titled "Calendar" would leave the Calendar tab
 * reading "Calendar" whether it loaded or not — and every assertion on the tab
 * would hold against a view that never fetched anything.
 */
const RESTORED_PAGE_TITLE = "Restored Stand-In";

const DORMANT_PAGE_TITLE = "Woken Stand-In";

let server: TestServer;

test.beforeAll(async () => {
  server = await startTestServer();
});

test.afterAll(async () => {
  await server.close();
});

/*
 * A function rather than an object, because two of the things seeded cannot be
 * named while this file is being read: the port the server ends up on, and the
 * user data directory the app is about to run in, which is where the downloads
 * go so that they land inside what the harness already cleans up.
 */
const meru = useApp(async ({ userDataDir }) => {
  const downloadsLocation = path.join(userDataDir, "downloads");

  await mkdir(downloadsLocation, { recursive: true });

  return {
    "downloads.location": downloadsLocation,
    /*
     * Seeded so that the launcher has apps to offer. Both hosts gate it on
     * `isLicenseKeyValid && launcherApps.length > 0`, and the default list is
     * empty — so without this the launcher is absent because it has nothing to
     * show, and the assertion below would hold with the license check deleted.
     */
    "workspaceApps.launcherApps": ["calendar", "tasks"],
    accounts: [
      seedAccount({
        id: ACCOUNT_ID,
        label: "Default",
        savedTabs: [
          seedSavedTab({
            app: "calendar",
            url: server.pageUrl(RESTORED_PAGE_TITLE),
            title: RESTORED_TAB_TITLE,
            loadOnLaunch: true,
          }),
          seedSavedTab({
            app: "keep",
            url: server.pageUrl(DORMANT_PAGE_TITLE),
            title: DORMANT_TAB_TITLE,
          }),
        ],
      }),
    ],
  };
});

/** The downloads directory the seed above pointed the app at. */
function downloadsLocation() {
  return path.join(meru.userDataDir, "downloads");
}

/**
 * Waits for the view a saved tab was restored into.
 *
 * `loadLaunchTabs` runs during startup, which the harness does not wait on —
 * it waits for the renderer, and the two are not ordered against each other.
 */
async function waitForRestoredView() {
  await expect
    .poll(async () => (await readViews(meru)).map((view) => view.url.startsWith(server.origin)))
    .toContain(true);
}

test("a saved tab is restored into a child view of its own", async () => {
  await waitForRestoredView();

  const views = await readViews(meru);

  /*
   * Two: the account's Gmail view, and the workspace app restored beside it.
   * Asserted as a count as well as by URL, because a second view of the same
   * app — a saved tab materialized twice — would satisfy every other assertion
   * here while being exactly the sort of thing this machinery gets wrong.
   */
  expect(views).toHaveLength(2);

  const restoredView = findViewByUrl(views, server.origin);

  expect(restoredView?.url).toBe(server.pageUrl(RESTORED_PAGE_TITLE));

  // The view really loaded the page, rather than being attached with a URL set
  // on it: a title only exists once a document has parsed.
  expect(restoredView?.title).toBe(RESTORED_PAGE_TITLE);

  /*
   * And the strip is showing the page's title rather than the one the tab was
   * saved with, which is a restored tab following the app it holds. The two
   * titles are deliberately different, so this fails against a view that was
   * attached and never fetched anything — where the tab would fall back to the
   * workspace app's own label.
   */
  await expect(meru.renderer.getByRole("button", { name: RESTORED_PAGE_TITLE })).toBeVisible();

  await expect(meru.renderer.getByRole("button", { name: RESTORED_TAB_TITLE })).toHaveCount(0);
});

test("a restored view is inset by the chrome the renderer owns", async () => {
  await waitForRestoredView();

  const restoredView = findViewByUrl(await readViews(meru), server.origin);

  if (!restoredView) {
    throw new Error("The saved tab was never restored into a view");
  }

  const unfilled = await readUnfilledSpace(meru, restoredView);

  /*
   * Exact on both insets, and against the app's own constants rather than the
   * numbers they currently come to. Nothing platform-dependent goes into
   * either: the titlebar and the tab strip are Meru's own measurements, drawn
   * by the renderer, and a view laid over either of them is covering the
   * app's own interface.
   *
   * The strip is at its narrow width because the account has more than one tab
   * and none of them is an unpinned second tab for the same app, which is the
   * only thing that widens it while `verticalTabs.width` is left at `auto`.
   */
  expect(unfilled.left).toBe(VERTICAL_TABS_NARROW_WIDTH);
  expect(unfilled.top).toBe(APP_TITLEBAR_HEIGHT);

  // And it spans everything left over, so no strip of window shows through
  // beside or beneath it.
  expect(unfilled.right).toBe(0);
  expect(unfilled.bottom).toBe(0);
});

test("waking a dormant tab adds a view and brings it to the front", async () => {
  await waitForRestoredView();

  /*
   * In front is last: the window lists its children bottom first, and the app
   * puts the active tab's view at the end by removing and re-adding it. Every
   * view here has the same bounds, so which one the user is actually looking
   * at is this and nothing else.
   */
  const viewsBefore = await readViews(meru);

  /*
   * Named by what it is not, because the only other view is Gmail's and its
   * title is whatever Google served — a sign-in page, or Chromium's network
   * error page on a runner with no route out. Asserting that the restored
   * workspace app is behind says the same thing about z-order and asks nothing
   * of a third party.
   */
  expect(viewsBefore.at(-1)?.url.startsWith(server.origin)).toBe(false);

  /*
   * Opened by clicking the tab, which is how anyone opens one. The dormant tab
   * is still showing its seeded title, because nothing has loaded to replace
   * it — that is what makes it findable by the name the seed gave it.
   */
  await meru.renderer.getByRole("button", { name: DORMANT_TAB_TITLE }).click();

  await expect.poll(async () => (await readViews(meru)).length).toBe(3);

  const viewsAfter = await readViews(meru);

  // The woken tab is the active one, so its view is the one in front now.
  await expect
    .poll(async () => (await readViews(meru)).at(-1)?.url)
    .toBe(server.pageUrl(DORMANT_PAGE_TITLE));

  // And the tab that was already open kept its view rather than being torn down
  // and rebuilt behind the new one.
  expect(findViewByUrl(viewsAfter, server.pageUrl(RESTORED_PAGE_TITLE))).toBeDefined();
});

test("a workspace app view runs in its account's session", async () => {
  await waitForRestoredView();

  const views = await readViews(meru);

  /*
   * Every view belongs to the account, so every one of them runs in the
   * account's partition rather than the session Electron hands out by default.
   * A view that fell back to the default session would share cookies with every
   * other account, which is the failure this is here for.
   */
  for (const view of views) {
    expect(view.isDefaultSession, view.url).toBe(false);

    // Contained rather than compared to a built path: the partition directory
    // is named for the account, but the separator around it is the platform's.
    expect(view.storagePath, view.url).toContain(ACCOUNT_ID);
  }

  // The workspace app is in the same session as the account's Gmail view, which
  // is what lets it be signed in at all.
  const storagePaths = new Set(views.map((view) => view.storagePath));

  expect(storagePaths.size).toBe(1);
});

test("the workspace apps launcher is absent without a license", async () => {
  /*
   * The inverse of the assertion in `workspace-apps-pro.e2e.ts`, and the reason
   * it is worth making from both sides: neither file keeps a list of what the
   * license unlocks, so a launcher that stopped being gated fails here, and one
   * that stopped appearing at all fails there.
   */
  /*
   * The strip is waited for first, which is what makes the absence below a
   * decision the app made rather than a moment arriving too early. An earlier
   * version of this test asserted straight away and passed while the app was
   * showing the launcher — see `waitForVerticalTabs`.
   */
  await waitForVerticalTabs(meru);

  await expect(meru.renderer.getByRole("button", { name: "Open app" })).toHaveCount(0);
});

test("a download from a workspace app lands on disk and in the history", async () => {
  await waitForRestoredView();

  /*
   * The view is a page in its own right as far as Playwright is concerned, so
   * the link is clicked in the workspace app itself rather than driven through
   * the main process. That is the path a real download takes: the click is in
   * the view, and everything after it is the app's.
   */
  await expect
    .poll(() => meru.app.windows().some((page) => page.url().startsWith(server.origin)))
    .toBe(true);

  const workspaceAppPage = meru.app.windows().find((page) => page.url().startsWith(server.origin));

  if (!workspaceAppPage) {
    throw new Error("The restored view never became a page");
  }

  await workspaceAppPage.getByRole("link", { name: "Download the file" }).click();

  // On disk, in the directory the config named, with what the server sent.
  await expect.poll(() => readdir(downloadsLocation())).toEqual([DOWNLOAD_FILE_NAME]);

  expect(await readFile(path.join(downloadsLocation(), DOWNLOAD_FILE_NAME), "utf8")).toBe(
    DOWNLOAD_BODY,
  );

  /*
   * And recorded. Polled against the config on disk rather than the page,
   * because what is being proved is the main process writing the download
   * through to the file it keeps history in.
   */
  await expect
    .poll(async () =>
      (await meru.readConfig())["downloads.history"]?.map(({ fileName }) => fileName),
    )
    .toEqual([DOWNLOAD_FILE_NAME]);

  // Then where a user would look for it. The menu is the way in, as everywhere
  // else in this suite.
  expect(await meru.runMenuCommand("Downloads")).toBe(true);

  await expect(meru.renderer.getByTitle(DOWNLOAD_FILE_NAME)).toBeVisible();
});
