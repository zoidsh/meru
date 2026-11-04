/*
 * What every renderer page has to hold to: whatever it loads gets every IPC
 * channel through the renderer preload, so it stays on its own document, and
 * what it would leave for, or open in a new window, reaches the browser only
 * when it is a web link.
 *
 * Everything here goes through the main process by `webContents` id rather
 * than through a Playwright page: a page that navigated away is the failure
 * being looked for, and a locator would wait on a document that left.
 */
import { expect } from "@playwright/test";
import type { MeruApp } from "./app";

const NAVIGATED_URL = "https://example.com/nav-guard";

const OPENED_URL = "https://example.com/open";

/**
 * Stubs the browser hand-off, so a test reads what would have opened instead
 * of opening it, and serves example.com, so a navigation that gets through
 * does not reach the network.
 */
export async function stubBrowser(meru: MeruApp) {
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
}

function readOpenedUrls(meru: MeruApp) {
  return meru.app.evaluate(() => Reflect.get(globalThis, "__openedUrls") as string[]);
}

/** The id of the `webContents` showing `page`, waited for. */
export async function findRendererPage(meru: MeruApp, page: string) {
  let id: number | undefined;

  await expect
    .poll(async () => {
      id = await meru.app.evaluate(
        ({ webContents }, pageFileName) =>
          webContents
            .getAllWebContents()
            .find((candidate) =>
              new URL(candidate.getURL() || "about:blank").pathname.endsWith(`/${pageFileName}`),
            )?.id,
        `${page}.html`,
      );

      return id;
    })
    .toBeDefined();

  return id as number;
}

function readPageUrl(meru: MeruApp, id: number) {
  return meru.app.evaluate(
    ({ webContents }, webContentsId) => webContents.fromId(webContentsId)?.getURL(),
    id,
  );
}

function readWindowCount(meru: MeruApp) {
  return meru.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
}

/**
 * Not awaited inside the page: a script that navigates takes the context it
 * would answer from with it.
 */
function runInPage(meru: MeruApp, id: number, script: string) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId, source }) => {
      webContents
        .fromId(webContentsId)
        ?.executeJavaScript(source, true)
        .catch(() => undefined);
    },
    { webContentsId: id, source: script },
  );
}

function readBridgeType(meru: MeruApp, id: number) {
  return meru.app.evaluate(
    ({ webContents }, webContentsId) =>
      webContents
        .fromId(webContentsId)
        ?.executeJavaScript("typeof window.electron")
        .catch(() => "unreachable"),
    id,
  );
}

export async function expectNavigationOpensInBrowser(meru: MeruApp, id: number) {
  const pageUrl = await readPageUrl(meru, id);

  await runInPage(meru, id, `location.href = ${JSON.stringify(NAVIGATED_URL)}`);

  // Soft, so a navigation that got through still reports where the page went.
  await expect
    .configure({ soft: true })
    .poll(() => readOpenedUrls(meru))
    .toEqual([NAVIGATED_URL]);

  expect(await readPageUrl(meru, id)).toBe(pageUrl);
}

export async function expectNewWindowOpensOnlyWebLinks(meru: MeruApp, id: number) {
  const pageUrl = await readPageUrl(meru, id);

  const windowCount = await readWindowCount(meru);

  await runInPage(meru, id, 'window.open("file:///etc/hosts")');

  // Opened last, so once it reaches the browser the one before it has been
  // turned down or let through.
  await runInPage(meru, id, `window.open(${JSON.stringify(OPENED_URL)})`);

  // Soft, so a page that opens windows of its own still reports how many.
  await expect
    .configure({ soft: true })
    .poll(() => readOpenedUrls(meru))
    .toContain(OPENED_URL);

  expect(await readOpenedUrls(meru)).toEqual([OPENED_URL]);

  expect(await readWindowCount(meru)).toBe(windowCount);

  expect(await readPageUrl(meru, id)).toBe(pageUrl);
}

/**
 * A navigation Chromium runs no navigation throttles for, `about:blank`
 * among them, never reaches `will-navigate`, so it commits. Waited on until it
 * has, since before then the page is still where it started, and an assertion
 * that it came back would hold against a page that never left.
 */
export async function expectReturnFromNavigation(meru: MeruApp, id: number, url: string) {
  const pageUrl = await readPageUrl(meru, id);

  await meru.app.evaluate(({ webContents }, webContentsId) => {
    const target = webContents.fromId(webContentsId);

    const committedUrls: string[] = [];

    Reflect.set(globalThis, "__committedUrls", committedUrls);

    target?.on("did-navigate", (_event, committedUrl) => {
      committedUrls.push(committedUrl);
    });

    // An `about:srcdoc` in a main frame commits as an error page, which is
    // reported here rather than as a navigation.
    target?.on("did-fail-load", (_event, _code, _description, failedUrl, isMainFrame) => {
      if (isMainFrame) {
        committedUrls.push(failedUrl);
      }
    });
  }, id);

  await runInPage(meru, id, `location.href = ${JSON.stringify(url)}`);

  await expect
    .poll(() => meru.app.evaluate(() => Reflect.get(globalThis, "__committedUrls") as string[]))
    .toContain(url);

  await expect.poll(() => readPageUrl(meru, id)).toBe(pageUrl);

  await expect.poll(() => readBridgeType(meru, id)).toBe("object");

  expect(await readOpenedUrls(meru)).toEqual([]);
}
