/*
 * The main window's page holds the full IPC bridge, so whatever it loads gets
 * every channel. It stays on Meru's own page, and what it would leave for, or
 * open in a new window, reaches the browser only when it is a web link.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

const NAVIGATED_URL = "https://example.com/nav-guard";

const OPENED_URL = "https://example.com/open";

const meru = useApp();

test.beforeEach(async () => {
  // Fulfilled so a navigation that gets through does not reach the network.
  await meru.app
    .context()
    .route("https://example.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<p>Elsewhere</p>" }),
    );

  await meru.app.evaluate(({ shell }) => {
    const openedUrls: string[] = [];

    Reflect.set(globalThis, "__openedUrls", openedUrls);

    shell.openExternal = async (url) => {
      openedUrls.push(url);
    };
  });
});

function readOpenedUrls() {
  return meru.app.evaluate(() => Reflect.get(globalThis, "__openedUrls") as string[]);
}

/**
 * The main window is the only one a fresh launch has. Read from the main
 * process: a locator would wait on a navigation that left.
 */
function readWindowUrls() {
  return meru.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => window.webContents.getURL()),
  );
}

test("a navigation away from the page opens in the browser and leaves the window where it was", async () => {
  const pageUrl = meru.renderer.url();

  await meru.renderer.evaluate((url) => {
    location.href = url;
  }, NAVIGATED_URL);

  // Soft, so a navigation that got through still reports where the window went.
  await expect.configure({ soft: true }).poll(readOpenedUrls).toEqual([NAVIGATED_URL]);

  expect(await readWindowUrls()).toEqual([pageUrl]);
});

test("a new window opens in the browser only for a web link", async () => {
  await meru.renderer.evaluate(() => {
    window.open("file:///etc/hosts");
    window.open("smb://example.com/share");
  });

  // Opened last, so once it reaches the browser the two before it have been
  // turned down or let through.
  await meru.renderer.evaluate((url) => {
    window.open(url);
  }, OPENED_URL);

  await expect.poll(readOpenedUrls).toContain(OPENED_URL);

  expect(await readOpenedUrls()).toEqual([OPENED_URL]);

  expect(await readWindowUrls()).toEqual([meru.renderer.url()]);
});

test("settings routes still switch within the page", async () => {
  const pageUrl = meru.renderer.url().split("#")[0];

  const navigation = await meru.openSettings();

  await openSettingsPage(meru, navigation, "General");

  await expect(meru.renderer).toHaveURL(/#\/settings\/general$/);

  await openSettingsPage(meru, navigation, "Appearance");

  await expect(meru.renderer).toHaveURL(/#\/settings\/appearance$/);

  expect((await readWindowUrls()).map((url) => url.split("#")[0])).toEqual([pageUrl]);

  expect(await readOpenedUrls()).toEqual([]);
});
