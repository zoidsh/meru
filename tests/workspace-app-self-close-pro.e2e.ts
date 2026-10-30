/*
 * A windowed workspace app whose page closes itself with `window.close()`.
 *
 * Its own file rather than a test in `workspace-apps-pro.e2e.ts`, whose seed is
 * shared by every test there and whose view helpers read the first window as
 * the only one: a second `BrowserWindow` would break them.
 *
 * Under a license, because workspace apps are a Pro feature.
 */
import { expect, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useProApp } from "./lib/app";
import { startTestServer, type TestServer } from "./lib/server";
import { waitForVerticalTabs } from "./lib/strip";

const PAGE_TITLE = "Self-Closing Stand-In";

let server: TestServer;

/*
 * A workspace app takes its app from every URL it navigates to, and only a tab
 * that still has one is saved, so goes dormant when its window closes rather
 * than leaving the strip. A plain loopback page has none. The query names
 * Calendar's host where `getWorkspaceAppFromUrl`, which matches it anywhere in
 * the URL, finds it, and the server ignores it.
 */
function pageUrl() {
  return `${server.pageUrl(PAGE_TITLE)}?stand-in-for=/calendar.google.com`;
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

const meru = useProApp(() => ({
  accounts: [
    seedAccount({
      id: "5eeded00-0000-4000-8000-00000000ac03",
      label: "Self-close",
      savedTabs: [
        {
          ...seedSavedTab({
            app: "calendar",
            url: pageUrl(),
            title: "Calendar",
            loadOnLaunch: true,
          }),
          windowed: true,
        },
      ],
    }),
  ],
}));

test("a saved windowed tab whose page closes itself goes dormant without an error", async () => {
  await waitForVerticalTabs(meru);

  await expect
    .poll(() =>
      meru.app.evaluate(
        ({ webContents }, url) =>
          webContents
            .getAllWebContents()
            .some((contents) => contents.getURL() === url && !contents.isLoading()),
        pageUrl(),
      ),
    )
    .toBe(true);

  expect(await countWindows()).toBe(2);

  /*
   * Any listener at all also stops Electron from showing its main-process error
   * dialog, which would otherwise leave the app waiting on a click and the test
   * on a timeout rather than a failure that names the error.
   */
  await meru.app.evaluate(() => {
    const errors: string[] = [];

    Object.assign(globalThis, { selfCloseErrors: errors });

    process.on("uncaughtException", (error) => {
      errors.push(String(error.stack));
    });
  });

  await meru.app.evaluate(({ webContents }, url) => {
    const contents = webContents.getAllWebContents().find((each) => each.getURL() === url);

    if (!contents) {
      throw new Error(`No webContents has loaded ${url}`);
    }

    // Deferred so the call returns before the page and its webContents go away
    void contents.executeJavaScript("setTimeout(() => window.close(), 50); null");
  }, pageUrl());

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

  expect(
    await meru.app.evaluate(
      () => (globalThis as unknown as { selfCloseErrors: string[] }).selfCloseErrors,
    ),
  ).toEqual([]);

  expect(await countWindows()).toBe(1);

  /*
   * The strip draws a dormant tab faded and nothing else marks it, so the class
   * is the renderer's only statement that the tab went dormant rather than
   * staying behind as a closed live one.
   */
  const tab = meru.renderer.getByRole("button", { name: PAGE_TITLE, exact: true });

  await expect(tab).toBeVisible();

  await expect(tab).toHaveClass(/\bopacity-50\b/);
});
