/*
 * Declared content scripts, the worker's `executeScript` answer and the
 * catalog's `chrome.storage.local` defaults, exercised through the checked-in
 * fixture extension (`packages/electron-extensions/fixture`), which the app
 * hands the declarations a catalog entry would (`fixture/catalog.ts`).
 *
 * A worker's `executeScript` into an account's tab can never inject anything:
 * the tab is in another session, and Chromium resolves the id inside the
 * worker's own. What runs is what the account's copy declared as static
 * content scripts, and the worker is answered for those files and no others.
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

const ACCOUNT_ID = "declared-account";

const ACCOUNT_PARTITION = `persist:${ACCOUNT_ID}`;

const meru = useProApp(
  {
    "extensions.enabled": true,
    accounts: [
      {
        id: ACCOUNT_ID,
        label: "Declared",
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

/**
 * A page with a subframe of the same origin, both inside the fixture's match
 * patterns, so a frame the declared isolated-world script reaches and one its
 * top-frame-only MAIN-world sibling does not are both there to ask about.
 */
const SERVED_PAGES: Record<string, string> = {
  "/declared":
    "<!doctype html><html><head><meta charset='utf-8'><title>declared</title></head><body><iframe src=\"/declared-child\"></iframe></body></html>",
  "/declared-child":
    "<!doctype html><html><head><meta charset='utf-8'><title>declared child</title></head><body>child</body></html>",
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

/** The fixture as a session loaded it; `null` names the default session. */
async function readLoadedFixture(partition: string | null) {
  return meru.app.evaluate(
    ({ session }, { partition: partitionName, extensionId }) =>
      (partitionName === null
        ? session.defaultSession
        : session.fromPartition(partitionName)
      ).extensions
        .getAllExtensions()
        .find((extension) => extension.id === extensionId) ?? null,
    { partition, extensionId: FIXTURE_EXTENSION_ID },
  );
}

async function waitForFixture(partition: string | null) {
  await expect.poll(async () => (await readLoadedFixture(partition)) !== null).toBe(true);
}

/** Opens a hidden window in the session and resolves to its WebContents id. */
async function openWindow(partition: string | null, url: string) {
  await waitForFixture(partition);

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

/** Runs an expression in a frame's main world, the page's own. */
async function evaluateInFrame(webContentsId: number, expression: string, frameIndex?: number) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId, expression: source, frameIndex: index }) => {
      const contents = webContents.fromId(contentsId);

      const frame = index === undefined ? contents?.mainFrame : contents?.mainFrame.frames[index];

      return frame?.executeJavaScript(source) ?? null;
    },
    { webContentsId, expression, frameIndex },
  );
}

type ExecuteScriptReply = { frameIds: number[] | null; lastError: string | null };

/**
 * Asks the worker for one `executeScript`, through an extension page of the
 * worker's own session, which reaches it natively.
 */
async function executeScriptInWorker(popupId: number, injection: Record<string, unknown>) {
  return (await evaluateInFrame(
    popupId,
    `new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "execute-script", injection: ${JSON.stringify(injection)} },
        (reply) => resolve(reply ? { frameIds: reply.frameIds, lastError: reply.lastError } : null),
      );
    })`,
  )) as ExecuteScriptReply | null;
}

/** The subframe's extension frame id, which is its frame-tree-node id. */
async function readSubframeId(webContentsId: number) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId }) =>
      webContents.fromId(contentsId)?.mainFrame.frames[0]?.frameTreeNodeId ?? null,
    { webContentsId },
  );
}

const POPUP_URL = `chrome-extension://${FIXTURE_EXTENSION_ID}/popup.html?context=declared`;

test("an account's copy declares the scripts, shimming the isolated world and not the main one", async () => {
  await waitForFixture(null);

  await waitForFixture(ACCOUNT_PARTITION);

  const accountFixture = await readLoadedFixture(ACCOUNT_PARTITION);

  const contentScripts = (accountFixture?.manifest.content_scripts ?? []) as {
    js?: string[];
    world?: string;
    all_frames?: boolean;
  }[];

  expect(contentScripts.map(({ js, world, all_frames }) => ({ js, world, all_frames }))).toEqual([
    { js: ["chrome-runtime-proxy-shim.js", "probe.js"], world: undefined, all_frames: true },
    { js: ["chrome-runtime-proxy-shim.js", "declared.js"], world: undefined, all_frames: true },
    { js: ["declared-main.js"], world: "MAIN", all_frames: false },
  ]);

  // The worker's own session injects with `executeScript` natively, so a
  // static copy there would run each script twice
  const workerFixture = await readLoadedFixture(null);

  const workerContentScripts = (workerFixture?.manifest.content_scripts ?? []) as {
    js?: string[];
  }[];

  expect(workerContentScripts.map(({ js }) => js)).toEqual([["probe.js"]]);
});

test("the declared scripts run in an account's page, each in its own world", async () => {
  const pageId = await openWindow(ACCOUNT_PARTITION, `${serverOrigin}/declared`);

  // The isolated-world script marks the document, which both worlds share
  await expect
    .poll(() =>
      evaluateInFrame(
        pageId,
        'document.documentElement.getAttribute("data-meru-fixture-declared")',
      ),
    )
    .toBe(JSON.stringify({ runtimeId: FIXTURE_EXTENSION_ID }));

  // The MAIN-world one leaves a global the page itself can read, and sees no
  // extension API there, so nothing ran ahead of it in that world
  await expect
    .poll(() => evaluateInFrame(pageId, "JSON.stringify(window.__meruFixtureDeclaredMain)"))
    .toBe(JSON.stringify({ runtimeId: null }));

  // And the bridge token, which rides the shim, stays out of the page's world
  expect(await evaluateInFrame(pageId, "typeof window.__electronExtensionsBridgeToken")).toBe(
    "undefined",
  );
});

test("the worker's executeScript into an account's tab is answered for declared files only", async () => {
  const pageId = await openWindow(ACCOUNT_PARTITION, `${serverOrigin}/declared`);

  const popupId = await openWindow(null, POPUP_URL);

  await expect
    .poll(() =>
      evaluateInFrame(
        pageId,
        'document.documentElement.getAttribute("data-meru-fixture-declared")',
      ),
    )
    .not.toBeNull();

  const subframeId = await readSubframeId(pageId);

  expect(subframeId).toEqual(expect.any(Number));

  const execute = (injection: Record<string, unknown>) => executeScriptInWorker(popupId, injection);

  // A declared file, into the top frame
  expect(await execute({ target: { tabId: pageId }, files: ["declared.js"] })).toEqual({
    frameIds: [0],
    lastError: null,
  });

  // A file the declared one stands in for, which the package does not carry
  expect(
    await execute({ target: { tabId: pageId, frameIds: [subframeId] }, files: ["stand-in.js"] }),
  ).toEqual({ frameIds: [subframeId], lastError: null });

  // The extension's own manifest script is in the page just the same
  expect(await execute({ target: { tabId: pageId }, files: ["probe.js"] })).toEqual({
    frameIds: [0],
    lastError: null,
  });

  // Every frame the declared script reaches
  expect(
    await execute({ target: { tabId: pageId, allFrames: true }, files: ["declared.js"] }),
  ).toEqual({ frameIds: [0, subframeId], lastError: null });

  // The MAIN-world script in its own world, and in the top frame only
  expect(
    await execute({ target: { tabId: pageId }, files: ["declared-main.js"], world: "MAIN" }),
  ).toEqual({ frameIds: [0], lastError: null });

  expect(
    await execute({
      target: { tabId: pageId, frameIds: [subframeId] },
      files: ["declared-main.js"],
      world: "MAIN",
    }),
  ).toEqual({
    frameIds: null,
    lastError:
      "Cannot access contents of the page. Extension manifest must request permission to access the respective host.",
  });

  // A declared file in the wrong world is no declared file
  expect(
    await execute({ target: { tabId: pageId }, files: ["declared.js"], world: "MAIN" }),
  ).toEqual({ frameIds: null, lastError: `No tab with id: ${pageId}` });

  // And anything undeclared stays the failure it really is
  expect(await execute({ target: { tabId: pageId }, files: ["background.js"] })).toEqual({
    frameIds: null,
    lastError: `No tab with id: ${pageId}`,
  });
});

test("the worker's store starts with the catalog's defaults", async () => {
  const popupId = await openWindow(null, POPUP_URL);

  await expect
    .poll(() =>
      evaluateInFrame(
        popupId,
        `new Promise((resolve) => {
          chrome.storage.local.get("seededDefault", (items) => resolve(items.seededDefault ?? null));
        })`,
      ),
    )
    .toBe("from the catalog");
});
