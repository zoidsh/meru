/*
 * A fallback reply turned into a rejection when the user closed the window the
 * worker opened for the request, exercised through the checked-in fixture
 * extension. Its worker stands in for Bitwarden's passkey request: it opens a
 * popout, and once the popout is gone answers with Bitwarden's fallback reply.
 * The fixture is opted in to the rewrite the way Bitwarden's catalog entry is
 * (`FIXTURE_WINDOW_CLOSE_FALLBACK_REJECTION`).
 *
 * The request is sent from an extension page in an account's session, which
 * reaches the worker through the runtime proxy the same way a content script
 * does, and the proxy is where the reply is rewritten.
 */
import { FIXTURE_WINDOW_CLOSE_FALLBACK_REJECTION } from "@meru/electron-extensions/fixture/catalog";
import { FIXTURE_EXTENSION_ID } from "@meru/electron-extensions/fixture/id";
import { expect, test } from "@playwright/test";
import { useProApp } from "./lib/app";

const ACCOUNT_ID = "fallback-account";

const meru = useProApp(
  {
    "extensions.enabled": true,
    accounts: [
      {
        id: ACCOUNT_ID,
        label: "Fallback",
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

const POPOUT_URL = `chrome-extension://${FIXTURE_EXTENSION_ID}/popup.html?context=fallback`;

const FALLBACK_REPLY = { error: { fallbackRequested: true, message: "FallbackRequested" } };

/** Opens the fixture's page in the account's session, whose messages the proxy relays. */
async function openAccountPage() {
  await expect
    .poll(async () =>
      meru.app.evaluate(
        ({ session }, { partition, extensionId }) =>
          session
            .fromPartition(partition)
            .extensions.getAllExtensions()
            .some((extension) => extension.id === extensionId),
        { partition: `persist:${ACCOUNT_ID}`, extensionId: FIXTURE_EXTENSION_ID },
      ),
    )
    .toBe(true);

  return meru.app.evaluate(
    async ({ BrowserWindow }, { partition, extensionId }) => {
      const pageWindow = new BrowserWindow({ show: false, webPreferences: { partition } });

      await pageWindow.loadURL(`chrome-extension://${extensionId}/popup.html?context=account`);

      return pageWindow.webContents.id;
    },
    { partition: `persist:${ACCOUNT_ID}`, extensionId: FIXTURE_EXTENSION_ID },
  );
}

async function runInPage<Result>(webContentsId: number, script: string) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId, script: pageScript }) =>
      webContents.fromId(contentsId)?.mainFrame.executeJavaScript(pageScript) ?? null,
    { webContentsId, script },
  ) as Promise<Result | null>;
}

/** Sends the fallback request without waiting, keeping its reply on the page. */
async function sendFallbackRequest(pageId: number, { withoutWindow = false } = {}) {
  await runInPage(
    pageId,
    `window.fallbackReply = undefined;
     chrome.runtime.sendMessage(
       { command: "fixture-fallback-request", withoutWindow: ${withoutWindow} },
       (reply) => { window.fallbackReply = reply ?? null; },
     );
     null`,
  );
}

async function readFallbackReply(pageId: number) {
  return runInPage<unknown>(pageId, "window.fallbackReply ?? null");
}

/** The `WebContents` id of the popout the worker opened, once it has loaded. */
async function findPopoutId() {
  let popoutId: number | null = null;

  await expect
    .poll(async () => {
      popoutId = await meru.app.evaluate(
        ({ BrowserWindow }, { url }) =>
          BrowserWindow.getAllWindows().find(
            (window) => window.webContents.getURL() === url && !window.webContents.isLoading(),
          )?.webContents.id ?? null,
        { url: POPOUT_URL },
      );

      return popoutId;
    })
    .not.toBeNull();

  return popoutId as unknown as number;
}

async function closePage(webContentsId: number) {
  await meru.app.evaluate(
    ({ BrowserWindow, webContents }, { webContentsId: contentsId }) => {
      const contents = webContents.fromId(contentsId);

      if (contents) {
        BrowserWindow.fromWebContents(contents)?.close();
      }
    },
    { webContentsId },
  );
}

test("closing the popout rejects the request instead of falling back", async () => {
  const pageId = await openAccountPage();

  await sendFallbackRequest(pageId);

  const popoutId = await findPopoutId();

  const closedAt = Date.now();

  await closePage(popoutId);

  await expect.poll(() => readFallbackReply(pageId)).not.toBeNull();

  expect(Date.now() - closedAt).toBeLessThan(5000);

  expect(await readFallbackReply(pageId)).toEqual({
    error: FIXTURE_WINDOW_CLOSE_FALLBACK_REJECTION.error,
  });

  await closePage(pageId);
});

/*
 * The page's own `window.close()` reaches the main process the way the user's
 * close does, and nothing tells the two apart. Bitwarden's popout buttons close
 * it this way after sending their own answer.
 */
test("a popout closing itself with window.close() counts as the user's close", async () => {
  const pageId = await openAccountPage();

  await sendFallbackRequest(pageId);

  const popoutId = await findPopoutId();

  await runInPage(popoutId, "setTimeout(() => window.close(), 50); null");

  await expect.poll(() => readFallbackReply(pageId)).not.toBeNull();

  expect(await readFallbackReply(pageId)).toEqual({
    error: FIXTURE_WINDOW_CLOSE_FALLBACK_REJECTION.error,
  });

  await closePage(pageId);
});

/*
 * A generic guarantee rather than a Bitwarden flow: whatever an extension
 * closes through `windows.remove` is its own doing, so its fallback stands.
 * Bitwarden's worker closes its passkey popout this way after the popout asks
 * for the user's device or security key.
 */
test("a window the extension removes through chrome.windows leaves the fallback in place", async () => {
  const pageId = await openAccountPage();

  await sendFallbackRequest(pageId);

  const popoutId = await findPopoutId();

  // Not awaited in the page, which goes away with its window before it could
  // answer
  await runInPage(
    popoutId,
    "chrome.windows.getCurrent().then((window) => chrome.windows.remove(window.id)); null",
  );

  await expect.poll(() => readFallbackReply(pageId)).not.toBeNull();

  expect(await readFallbackReply(pageId)).toEqual(FALLBACK_REPLY);

  await closePage(pageId);
});

test("a fallback with no window closed reaches the page unchanged", async () => {
  const pageId = await openAccountPage();

  await sendFallbackRequest(pageId, { withoutWindow: true });

  await expect.poll(() => readFallbackReply(pageId)).not.toBeNull();

  expect(await readFallbackReply(pageId)).toEqual(FALLBACK_REPLY);

  await closePage(pageId);
});
