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
 * Under a license, because workspace apps are a Pro feature. Every way of
 * acquiring one is gated — the launcher at `workspaceApps.openApp`, a link at
 * `WorkspaceApp.handleWindowOpen` — so a free version has no business holding
 * the saved tabs this file seeds. Restoring and waking them is not itself gated
 * today, which would let all of this run without a key; that gap is recorded in
 * the todo rather than leaned on here, because a test depending on it would
 * fail the day someone closes it and read as a regression when it was the fix.
 *
 * Two accounts, because a second one is the other thing a license buys, and it
 * is what makes session partitioning assertable at all: `getAccountConfigs`
 * slices the list to one whenever the license is invalid.
 *
 * What the views load is served from this machine — see `tests/lib/server.ts`
 * for why. The view, its session and its layout are all the app's own.
 *
 * The free version's side of the launcher claim is in
 * `tests/workspace-apps.e2e.ts`.
 */
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { APP_TITLEBAR_HEIGHT, VERTICAL_TABS_NARROW_WIDTH } from "@meru/shared/constants";
import { expect, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useProApp } from "./lib/app";
import { DOWNLOAD_BODY, DOWNLOAD_FILE_NAME, startTestServer, type TestServer } from "./lib/server";
import { findViewByUrl, readUnfilledSpace, readViews } from "./lib/views";

/*
 * Fixed rather than generated, because each account's session is partitioned on
 * its id: a literal here is what the storage paths below are asserted against,
 * and a generated one would leave those assertions comparing the app to itself.
 */
const FIRST_ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

const SECOND_ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac02";

/** The saved tab seeded without `loadOnLaunch`, so it comes back as an entry with nothing behind it. */
const DORMANT_TAB_TITLE = "Keep";

/*
 * What the served pages are titled, deliberately not the workspace app labels
 * the tabs carry. `WorkspaceApp.resolveTitle` falls back to the app's label when
 * no page title ever arrives, so a page titled "Calendar" would leave a Calendar
 * tab reading "Calendar" whether it loaded or not — and an assertion on the tab
 * would hold against a view that never fetched anything.
 */
const RESTORED_PAGE_TITLE = "Restored Stand-In";

const DORMANT_PAGE_TITLE = "Woken Stand-In";

const SECOND_ACCOUNT_PAGE_TITLE = "Second Account Stand-In";

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
const meru = useProApp(async ({ userDataDir }) => {
  const downloadsLocation = path.join(userDataDir, "downloads");

  await mkdir(downloadsLocation, { recursive: true });

  return {
    "downloads.location": downloadsLocation,
    /*
     * Two, so the launcher menu has more than one thing in it and so one of them
     * is an app the selected account has never held as a saved tab. The strip's
     * launcher is a single button with a dropdown whatever the count — the
     * display setting that lays apps out inline is a titlebar concern.
     */
    "workspaceApps.launcherApps": ["calendar", "tasks"],
    accounts: [
      seedAccount({
        id: FIRST_ACCOUNT_ID,
        label: "First",
        selected: true,
        savedTabs: [
          seedSavedTab({
            app: "calendar",
            url: server.pageUrl(RESTORED_PAGE_TITLE),
            title: "Calendar",
            loadOnLaunch: true,
          }),
          seedSavedTab({
            app: "keep",
            url: server.pageUrl(DORMANT_PAGE_TITLE),
            title: DORMANT_TAB_TITLE,
          }),
        ],
      }),
      seedAccount({
        id: SECOND_ACCOUNT_ID,
        label: "Second",
        selected: false,
        savedTabs: [
          seedSavedTab({
            app: "tasks",
            url: server.pageUrl(SECOND_ACCOUNT_PAGE_TITLE),
            title: "Tasks",
            loadOnLaunch: true,
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
 * Waits for both accounts to have brought their saved tab back as a view.
 *
 * `loadLaunchTabs` runs during startup, which the harness does not wait on — it
 * waits for the renderer, and the two are not ordered against each other.
 */
async function waitForRestoredViews() {
  await expect
    .poll(
      async () =>
        (await readViews(meru)).filter((view) => view.url.startsWith(server.origin)).length,
    )
    .toBe(2);
}

test("a saved tab is restored into a child view of its own", async () => {
  await waitForRestoredViews();

  /*
   * One view for that page and no more. Counted by URL rather than as a total,
   * because what would go wrong here is a saved tab materialized twice — which a
   * total shared with two accounts' Gmail views would not single out.
   */
  const restoredViews = (await readViews(meru)).filter(
    (view) => view.url === server.pageUrl(RESTORED_PAGE_TITLE),
  );

  expect(restoredViews).toHaveLength(1);

  // The view really loaded the page, rather than being attached with a URL set
  // on it: a title only exists once a document has parsed.
  expect(restoredViews[0]?.title).toBe(RESTORED_PAGE_TITLE);

  /*
   * And the strip is showing the page's title rather than the one the tab was
   * saved with, which is a restored tab following the app it holds. The two are
   * deliberately different, so this fails against a view that was attached and
   * never fetched anything — where the tab would fall back to the workspace
   * app's own label.
   */
  await expect(meru.renderer.getByRole("button", { name: RESTORED_PAGE_TITLE })).toBeVisible();

  await expect(meru.renderer.getByRole("button", { name: "Calendar", exact: true })).toHaveCount(0);
});

test("a restored view is inset by the chrome the renderer owns", async () => {
  await waitForRestoredViews();

  const restoredView = findViewByUrl(await readViews(meru), server.pageUrl(RESTORED_PAGE_TITLE));

  if (!restoredView) {
    throw new Error("The saved tab was never restored into a view");
  }

  const unfilled = await readUnfilledSpace(meru, restoredView);

  /*
   * Exact on both insets, and against the app's own constants rather than the
   * numbers they currently come to. Nothing platform-dependent goes into either:
   * the titlebar and the tab strip are Meru's own measurements, drawn by the
   * renderer, and a view laid over either of them is covering the app's own
   * interface.
   *
   * The strip is at its narrow width because the selected account has more than
   * one tab and none of them is an unpinned second tab for the same app, which
   * is the only thing that widens it while `verticalTabs.width` is left at
   * `auto`.
   */
  expect(unfilled.left).toBe(VERTICAL_TABS_NARROW_WIDTH);
  expect(unfilled.top).toBe(APP_TITLEBAR_HEIGHT);

  // And it spans everything left over, so no strip of window shows through
  // beside or beneath it.
  expect(unfilled.right).toBe(0);
  expect(unfilled.bottom).toBe(0);
});

test("waking a dormant tab adds a view and brings it to the front", async () => {
  await waitForRestoredViews();

  const viewsBefore = await readViews(meru);

  /*
   * In front is last: the window lists its children bottom first, and the app
   * puts the active tab's view at the end by removing and re-adding it. Every
   * view here has the same bounds, so which one the user is actually looking at
   * is this and nothing else.
   *
   * Named by what it is not, because the view in front at launch is an account's
   * Gmail one, and its title is whatever Google served — a sign-in page, or
   * Chromium's network error page on a runner with no route out.
   */
  expect(viewsBefore.at(-1)?.url.startsWith(server.origin)).toBe(false);

  /*
   * Opened by clicking the tab, which is how anyone opens one. The dormant tab
   * is still showing its seeded title, because nothing has loaded to replace it
   * — that is what makes it findable by the name the seed gave it.
   */
  await meru.renderer.getByRole("button", { name: DORMANT_TAB_TITLE }).click();

  await expect.poll(async () => (await readViews(meru)).length).toBe(viewsBefore.length + 1);

  // The woken tab is the active one, so its view is the one in front now.
  await expect
    .poll(async () => (await readViews(meru)).at(-1)?.url)
    .toBe(server.pageUrl(DORMANT_PAGE_TITLE));

  // And the tab that was already open kept its view rather than being torn down
  // and rebuilt behind the new one.
  expect(findViewByUrl(await readViews(meru), server.pageUrl(RESTORED_PAGE_TITLE))).toBeDefined();
});

test("each account's views run in a session of its own", async () => {
  await waitForRestoredViews();

  const views = await readViews(meru);

  /*
   * Four: a Gmail view and a restored workspace app for each of the two
   * accounts. This is the claim the free version cannot make at all — there, the
   * second account is sliced off before any of it is created.
   */
  expect(views).toHaveLength(4);

  const viewUrlsByAccount = new Map<string, string[]>();

  for (const view of views) {
    /*
     * Never the session Electron hands out by default. A view that fell back to
     * it would share cookies with every other account, which is the failure this
     * is here for.
     */
    expect(view.isDefaultSession, view.url).toBe(false);

    // Contained rather than compared against a built path: the partition
    // directory is named for the account, but the separator around it is the
    // platform's.
    const accountId = [FIRST_ACCOUNT_ID, SECOND_ACCOUNT_ID].find((id) =>
      view.storagePath.includes(id),
    );

    expect(accountId, `${view.url} is in no account's partition`).toBeDefined();

    viewUrlsByAccount.set(accountId as string, [
      ...(viewUrlsByAccount.get(accountId as string) ?? []),
      view.url,
    ]);
  }

  /*
   * Two accounts, two views each, and no view in the wrong one. A workspace app
   * that landed in the other account's partition would be signed in as the wrong
   * person, which is the whole reason the sessions are split.
   */
  expect(viewUrlsByAccount.size).toBe(2);

  expect(viewUrlsByAccount.get(FIRST_ACCOUNT_ID)).toHaveLength(2);
  expect(viewUrlsByAccount.get(SECOND_ACCOUNT_ID)).toHaveLength(2);

  // The two partitions really are different directories, rather than one path
  // that happens to contain both ids.
  expect(new Set(views.map((view) => view.storagePath)).size).toBe(2);
});

test("the launcher opens a workspace app that was never a saved tab", async () => {
  await waitForRestoredViews();

  const viewCountBefore = (await readViews(meru)).length;

  /*
   * The launcher is in the tab strip, and it is a renderer-drawn menu rather
   * than a native one, so it can be driven from here. It is only rendered at all
   * because the license is valid — the free version's side of that is asserted
   * in `workspace-apps.e2e.ts`.
   */
  await meru.renderer.getByRole("button", { name: "Open app" }).click();

  const launcherMenu = meru.renderer.getByRole("menu");

  await expect(launcherMenu).toBeVisible();

  await expect(launcherMenu.getByRole("menuitem")).toHaveCount(2);

  /*
   * The last item is Tasks, which the selected account has never held as a saved
   * tab — the first is Calendar, which it has, so opening that one would prove
   * nothing this test's name claims. Tasks is seeded on the other account, and
   * an account's tabs are its own.
   */
  await launcherMenu.getByRole("menuitem").last().click();

  /*
   * A view is created for it. What that view goes on to load is a real Google
   * property, so nothing here waits on the page: the view exists the moment the
   * app opens the tab, and a load that never arrives is logged rather than
   * thrown. Asserting the count and not the URL is what keeps this test's answer
   * independent of a third party being up.
   */
  await expect.poll(async () => (await readViews(meru)).length).toBe(viewCountBefore + 1);

  // And it is in front, in the selected account's session, the way a tab opened
  // by hand should be.
  await expect
    .poll(async () => (await readViews(meru)).at(-1)?.storagePath)
    .toContain(FIRST_ACCOUNT_ID);
});

test("a download from a workspace app lands on disk and in the history", async () => {
  await waitForRestoredViews();

  /*
   * The view is a page in its own right as far as Playwright is concerned, so
   * the link is clicked in the workspace app itself rather than driven through
   * the main process. That is the path a real download takes: the click is in
   * the view, and everything after it is the app's.
   */
  const restoredPageUrl = server.pageUrl(RESTORED_PAGE_TITLE);

  await expect
    .poll(() => meru.app.windows().some((page) => page.url() === restoredPageUrl))
    .toBe(true);

  const workspaceAppPage = meru.app.windows().find((page) => page.url() === restoredPageUrl);

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
