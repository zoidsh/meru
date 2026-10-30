/*
 * Workspace apps whose page closes itself with `window.close()`, which takes
 * the view's `webContents` away without going through any of the app's own
 * ways of closing a tab.
 *
 * Its own file rather than tests in `workspace-apps-pro.e2e.ts`, whose seed is
 * shared by every test there and whose view helpers read the first window as
 * the only one: the windowed tab seeded here opens a second `BrowserWindow`,
 * which would break them.
 *
 * Under a license, because workspace apps are a Pro feature.
 */
import { expect, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useProApp } from "./lib/app";
import { SIGN_IN_PAGE_TITLE, startTestServer, type TestServer } from "./lib/server";
import { waitForVerticalTabs } from "./lib/strip";

const WINDOWED_PAGE_TITLE = "Self-Closing Stand-In";

const PINNED_PAGE_TITLE = "Pinned Stand-In";

const UNPINNED_PAGE_TITLE = "Unpinned Stand-In";

const FIRST_PAGE_TITLE = "First Stand-In";

const SECOND_PAGE_TITLE = "Second Stand-In";

/*
 * The strip draws a dormant tab faded and nothing else marks it, so the class
 * is the renderer's only statement that the tab went dormant rather than
 * staying behind as a closed live one. Matched as a whole class, because every
 * button also carries `disabled:opacity-50`.
 */
const DORMANT_CLASS = /(?:^|\s)opacity-50(?:\s|$)/;

/** The strip draws the active tab in the `secondary` variant. */
const ACTIVE_CLASS = /(?:^|\s)bg-secondary(?:\s|$)/;

let server: TestServer;

/*
 * A workspace app takes its app from every URL it navigates to, and only a tab
 * that still has one is saved, so goes dormant when it closes rather than
 * leaving the strip. A plain loopback page has none. The query names
 * Calendar's host where `getWorkspaceAppFromUrl`, which matches it anywhere in
 * the URL, finds it, and the server ignores it.
 */
function pageUrl(pageTitle: string) {
  return `${server.pageUrl(pageTitle)}?stand-in-for=/calendar.google.com`;
}

test.beforeAll(async () => {
  server = await startTestServer();
});

test.afterAll(async () => {
  await server.close();
});

function countWindows() {
  return meru.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
}

function stripTab(pageTitle: string) {
  return meru.renderer.getByRole("button", { name: pageTitle, exact: true });
}

const meru = useProApp(() => ({
  accounts: [
    seedAccount({
      id: "5eeded00-0000-4000-8000-00000000ac03",
      label: "Self-close",
      savedTabs: [
        {
          ...seedSavedTab({
            app: "calendar",
            url: pageUrl(WINDOWED_PAGE_TITLE),
            title: "Calendar",
            loadOnLaunch: true,
          }),
          windowed: true,
        },
        seedSavedTab({
          app: "calendar",
          url: pageUrl(PINNED_PAGE_TITLE),
          title: "Calendar",
          loadOnLaunch: true,
        }),
        seedSavedTab({ app: "calendar", url: pageUrl(FIRST_PAGE_TITLE), title: FIRST_PAGE_TITLE }),
        seedSavedTab({
          app: "calendar",
          url: pageUrl(SECOND_PAGE_TITLE),
          title: SECOND_PAGE_TITLE,
        }),
      ],
    }),
  ],
}));

/*
 * Read off the window that holds the renderer rather than through `readViews`,
 * which takes the first window as the main one: here that can be the windowed
 * tab's.
 */
function readFrontViewUrl() {
  return meru.app.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes("main.html"),
    );

    if (!mainWindow) {
      throw new Error("The app has no main window");
    }

    const frontView = mainWindow.contentView.children.at(-1) as
      | Electron.WebContentsView
      | undefined;

    return frontView?.webContents?.getURL();
  });
}

function hasPage(url: string) {
  return meru.app.evaluate(
    ({ webContents }, pageUrl) =>
      webContents.getAllWebContents().some((contents) => contents.getURL() === pageUrl),
    url,
  );
}

function waitForLoadedPage(url: string) {
  return expect
    .poll(() =>
      meru.app.evaluate(
        ({ webContents }, loadedUrl) =>
          webContents
            .getAllWebContents()
            .some((contents) => contents.getURL() === loadedUrl && !contents.isLoading()),
        url,
      ),
    )
    .toBe(true);
}

/*
 * Any listener at all also stops Electron from showing its main-process error
 * dialog, which would otherwise leave the app waiting on a click and the test on
 * a timeout rather than a failure that names the error.
 */
function collectMainProcessErrors() {
  return meru.app.evaluate(() => {
    const errors: string[] = [];

    Object.assign(globalThis, { selfCloseErrors: errors });

    process.on("uncaughtException", (error) => {
      errors.push(String(error.stack));
    });
  });
}

function readMainProcessErrors() {
  return meru.app.evaluate(
    () => (globalThis as unknown as { selfCloseErrors: string[] }).selfCloseErrors,
  );
}

// As a user gesture, so the popup blocker lets a `window.open` through to the
// app's window open handler.
function runInPage(url: string, script: string) {
  return meru.app.evaluate(
    ({ webContents }, { pageUrl, pageScript }) => {
      const contents = webContents.getAllWebContents().find((each) => each.getURL() === pageUrl);

      if (!contents) {
        throw new Error(`No webContents has loaded ${pageUrl}`);
      }

      void contents.executeJavaScript(pageScript, true);
    },
    { pageUrl: url, pageScript: script },
  );
}

// Deferred so the call returns before the page and its webContents go away
function closePageItself(url: string) {
  return runInPage(url, "setTimeout(() => window.close(), 50); null");
}

test("a saved windowed tab whose page closes itself goes dormant without an error", async () => {
  await waitForVerticalTabs(meru);

  await waitForLoadedPage(pageUrl(WINDOWED_PAGE_TITLE));

  expect(await countWindows()).toBe(2);

  await collectMainProcessErrors();

  await closePageItself(pageUrl(WINDOWED_PAGE_TITLE));

  await expect.poll(countWindows).toBe(1);

  /*
   * A window focus rebuilds the menu, which looks the focused window up among
   * the workspace apps, and that lookup kept throwing for an instance left
   * behind with a destroyed window. The suite never focuses a window, so
   * `getFocusedWindow` returns null and the rebuild skips the lookup unless it
   * is stubbed.
   */
  await meru.app.evaluate(({ app, BrowserWindow }) => {
    const { selfCloseErrors } = globalThis as unknown as { selfCloseErrors: string[] };

    const mainWindow = BrowserWindow.getAllWindows()[0];

    BrowserWindow.getFocusedWindow = () => mainWindow ?? null;

    try {
      app.emit("browser-window-focus", {}, mainWindow);
    } catch (error) {
      selfCloseErrors.push(String((error as Error).stack));
    }
  });

  expect(await readMainProcessErrors()).toEqual([]);

  expect(await countWindows()).toBe(1);

  const tab = stripTab(WINDOWED_PAGE_TITLE);

  await expect(tab).toBeVisible();

  await expect(tab).toHaveClass(DORMANT_CLASS);
});

test("a pinned tab whose page closes itself goes dormant and stays saved", async () => {
  await waitForVerticalTabs(meru);

  await waitForLoadedPage(pageUrl(PINNED_PAGE_TITLE));

  await expect(stripTab(PINNED_PAGE_TITLE)).toBeVisible();

  await collectMainProcessErrors();

  await closePageItself(pageUrl(PINNED_PAGE_TITLE));

  // Until the page is gone, the tab is still the live one it was seeded as.
  await expect.poll(() => hasPage(pageUrl(PINNED_PAGE_TITLE))).toBe(false);

  const tab = stripTab(PINNED_PAGE_TITLE);

  await expect(tab).toBeVisible();

  await expect(tab).toHaveClass(DORMANT_CLASS);

  await expect
    .poll(async () =>
      (await meru.readConfig()).accounts?.[0]?.workspaceApps.savedTabs.map(
        (savedTab) => savedTab.url,
      ),
    )
    .toContain(pageUrl(PINNED_PAGE_TITLE));

  expect(await readMainProcessErrors()).toEqual([]);
});

test("an unpinned tab whose page closes itself can be reopened", async () => {
  await waitForVerticalTabs(meru);

  await waitForLoadedPage(pageUrl(PINNED_PAGE_TITLE));

  // Every seeded tab is pinned, so the unpinned one comes from a link.
  await runInPage(
    pageUrl(PINNED_PAGE_TITLE),
    `window.open(${JSON.stringify(pageUrl(UNPINNED_PAGE_TITLE))}); null`,
  );

  await expect(stripTab(UNPINNED_PAGE_TITLE)).toBeVisible();

  await waitForLoadedPage(pageUrl(UNPINNED_PAGE_TITLE));

  await collectMainProcessErrors();

  await closePageItself(pageUrl(UNPINNED_PAGE_TITLE));

  await expect.poll(() => hasPage(pageUrl(UNPINNED_PAGE_TITLE))).toBe(false);

  await expect(stripTab(UNPINNED_PAGE_TITLE)).toHaveCount(0);

  expect(await meru.runMenuCommand("Reopen Closed Tab")).toBe(true);

  await expect(stripTab(UNPINNED_PAGE_TITLE)).toBeVisible();

  expect(await readMainProcessErrors()).toEqual([]);
});

test("the active tab closing itself brings Gmail to the front", async () => {
  await waitForVerticalTabs(meru);

  await stripTab(FIRST_PAGE_TITLE).click();

  await expect.poll(readFrontViewUrl).toBe(pageUrl(FIRST_PAGE_TITLE));

  await stripTab(SECOND_PAGE_TITLE).click();

  await expect.poll(readFrontViewUrl).toBe(pageUrl(SECOND_PAGE_TITLE));

  await waitForLoadedPage(pageUrl(SECOND_PAGE_TITLE));

  await collectMainProcessErrors();

  await closePageItself(pageUrl(SECOND_PAGE_TITLE));

  /*
   * Every view stays attached and the active one is brought in front by being
   * re-added, so the first tab, which was in front before the second, shows
   * through unless Gmail's view is brought back over it.
   */
  await expect.poll(readFrontViewUrl).toBe(meru.gmailStandIn.signInUrl);

  // Gmail's tab is titled by the page its view lands on.
  await expect(stripTab(SIGN_IN_PAGE_TITLE)).toHaveClass(ACTIVE_CLASS);

  await expect(stripTab(SECOND_PAGE_TITLE)).not.toHaveClass(ACTIVE_CLASS);

  expect(await readMainProcessErrors()).toEqual([]);
});
