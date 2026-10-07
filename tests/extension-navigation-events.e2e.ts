/*
 * The `webNavigation` events main synthesizes for an opted-in extension,
 * exercised through the checked-in fixture extension
 * (`packages/electron-extensions/fixture`), which the app opts in the way a
 * catalog entry does. Electron dispatches none of them, and the worker runs in
 * the default session while the page it hears about is an account's.
 *
 * The fixture's worker registers its listeners at boot with a url filter for
 * `/navigation`, so nothing else the suite loads reaches them.
 *
 * The launch carries `MERU_EXTENSIONS_FIXTURE`, which puts the bundled fixture
 * into every session of this packaged build, and seeds the master switch on
 * because extensions are off by default. `useProApp` because extensions are
 * Pro.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { FIXTURE_EXTENSION_ID } from "@meru/electron-extensions/fixture/id";
import { expect, test } from "@playwright/test";
import { useProApp } from "./lib/app";

const ACCOUNT_ID = "navigation-account";

const ACCOUNT_PARTITION = `persist:${ACCOUNT_ID}`;

const meru = useProApp(
  {
    "extensions.enabled": true,
    accounts: [
      {
        id: ACCOUNT_ID,
        label: "Navigation",
        color: null,
        selected: true,
        notifications: true,
        gmail: { unreadBadge: true, delegatedAccountId: null, unifiedInbox: true },
        workspaceApps: { savedTabs: [], bookmarks: [] },
      },
    ],
  },
  { env: { MERU_EXTENSIONS_FIXTURE: "1" } },
);

const SERVED_PAGES: Record<string, string> = {
  "/navigation":
    "<!doctype html><html><head><meta charset='utf-8'><title>navigation</title></head><body><iframe src=\"/navigation-child\"></iframe></body></html>",
  "/navigation-child":
    "<!doctype html><html><head><meta charset='utf-8'><title>navigation child</title></head><body>child</body></html>",
  "/elsewhere":
    "<!doctype html><html><head><meta charset='utf-8'><title>elsewhere</title></head><body>elsewhere</body></html>",
};

let server: http.Server;

let serverOrigin: string;

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const page = SERVED_PAGES[request.url ?? ""];

    if (!page) {
      response.writeHead(404).end();

      return;
    }

    response.writeHead(200, { "content-type": "text/html" }).end(page);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  serverOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
  });
});

/** Whether a session has loaded the fixture; `null` names the default session. */
async function hasLoadedFixture(partition: string | null) {
  return meru.app.evaluate(
    ({ session }, { partition: partitionName, extensionId }) =>
      (partitionName === null
        ? session.defaultSession
        : session.fromPartition(partitionName)
      ).extensions
        .getAllExtensions()
        .some((extension) => extension.id === extensionId),
    { partition, extensionId: FIXTURE_EXTENSION_ID },
  );
}

/** Opens a hidden window in the session and resolves to its WebContents id. */
async function openWindow(partition: string | null, url: string) {
  await expect.poll(() => hasLoadedFixture(partition)).toBe(true);

  return meru.app.evaluate(
    async ({ BrowserWindow }, { partition: partitionName, url: windowUrl }) => {
      const window = new BrowserWindow({
        show: false,
        webPreferences: partitionName === null ? {} : { partition: partitionName },
      });

      await window.loadURL(windowUrl);

      return window.webContents.id;
    },
    { partition, url },
  );
}

async function closeWindow(webContentsId: number) {
  await meru.app.evaluate(
    ({ BrowserWindow, webContents }, { webContentsId: contentsId }) => {
      const contents = webContents.fromId(contentsId);

      if (contents) {
        BrowserWindow.fromWebContents(contents)?.destroy();
      }
    },
    { webContentsId },
  );
}

type NavigationEvent = {
  event: string;
  tabId: number;
  frameId: number;
  parentFrameId: number;
  url: string;
  frameType: string;
};

/** What the worker heard, asked through a page of its own session. */
async function readNavigationEvents(popupId: number) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId }) =>
      webContents.fromId(webContentsId)?.mainFrame.executeJavaScript(
        `new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "read-navigation-events" }, (reply) => {
            resolve(reply ? reply.events : null);
          });
        })`,
      ) ?? null,
    { webContentsId: popupId },
  ) as Promise<NavigationEvent[] | null>;
}

/** Whether main listens to a page's loads, which it does only while the worker listens. */
async function isListenedTo(webContentsId: number) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId }) =>
      (webContents.fromId(contentsId)?.listenerCount("did-frame-finish-load") ?? 0) > 0,
    { webContentsId },
  );
}

async function loadInWindow(webContentsId: number, url: string) {
  await meru.app.evaluate(
    async ({ webContents }, { webContentsId: contentsId, url: pageUrl }) => {
      await webContents.fromId(contentsId)?.loadURL(pageUrl);
    },
    { webContentsId, url },
  );
}

async function readSubframeId(webContentsId: number) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId }) =>
      webContents.fromId(contentsId)?.mainFrame.frames[0]?.frameTreeNodeId ?? null,
    { webContentsId },
  );
}

const POPUP_URL = `chrome-extension://${FIXTURE_EXTENSION_ID}/popup.html?context=navigation`;

test("the worker hears an account page's navigation, with its tab and frame ids", async () => {
  const popupId = await openWindow(null, POPUP_URL);

  // Answering at all means the worker ran its top level, which is where it
  // registers the listeners that park the stream
  await expect.poll(() => readNavigationEvents(popupId)).not.toBeNull();

  const pageId = await openWindow(ACCOUNT_PARTITION, "about:blank");

  await expect.poll(() => isListenedTo(pageId)).toBe(true);

  await loadInWindow(pageId, `${serverOrigin}/elsewhere`);

  await loadInWindow(pageId, `${serverOrigin}/navigation`);

  const subframeId = await readSubframeId(pageId);

  expect(subframeId).toBeGreaterThan(0);

  const pageUrl = `${serverOrigin}/navigation`;

  const childUrl = `${serverOrigin}/navigation-child`;

  await expect
    .poll(async () =>
      (await readNavigationEvents(popupId))
        ?.filter((event) => event.tabId === pageId)
        .map(({ event, frameId, parentFrameId, url, frameType }) => ({
          event,
          frameId,
          parentFrameId,
          url,
          frameType,
        })),
    )
    .toEqual(
      expect.arrayContaining([
        {
          event: "onBeforeNavigate",
          frameId: 0,
          parentFrameId: -1,
          url: pageUrl,
          frameType: "outermost_frame",
        },
        {
          event: "onCommitted",
          frameId: 0,
          parentFrameId: -1,
          url: pageUrl,
          frameType: "outermost_frame",
        },
        {
          event: "onDOMContentLoaded",
          frameId: 0,
          parentFrameId: -1,
          url: pageUrl,
          frameType: "outermost_frame",
        },
        {
          event: "onCompleted",
          frameId: 0,
          parentFrameId: -1,
          url: pageUrl,
          frameType: "outermost_frame",
        },
        {
          event: "onCompleted",
          frameId: subframeId,
          parentFrameId: 0,
          url: childUrl,
          frameType: "sub_frame",
        },
      ]),
    );

  // The worker's url filter kept out the page it loaded first
  expect(
    (await readNavigationEvents(popupId))?.some((event) => event.url.endsWith("/elsewhere")),
  ).toBe(false);

  await closeWindow(pageId);

  await closeWindow(popupId);
});
