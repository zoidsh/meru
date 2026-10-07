/*
 * `chrome.windows.create`, `remove` and `get`, exercised through the checked-in
 * fixture extension (`packages/electron-extensions/fixture`) rather than
 * through a curated one, which needs a real account and a real vault. Electron
 * implements none of the namespace, so what answers is the facade
 * (`facade/api/windows.ts`) over the windows the main process opens
 * (`windows/windows.ts` and `openExtensionWindow` in `packages/app`).
 *
 * Every call is made in the extension's service worker, asked for over
 * `runtime.sendMessage` from a page of the worker's own session. That is where
 * a password manager opens its unlock popout from, and it is the context with
 * no page of its own to show one in.
 *
 * The launch carries `MERU_EXTENSIONS_FIXTURE`, which puts the bundled fixture
 * into every session of this packaged build and opts it into windows the way a
 * catalog entry does, and seeds the master switch on because extensions are off
 * by default. `useProApp` because extensions are Pro.
 */
import { FIXTURE_EXTENSION_ID } from "@meru/electron-extensions/fixture/id";
import { expect, test } from "@playwright/test";
import { useProApp } from "./lib/app";

const meru = useProApp({ "extensions.enabled": true }, { env: { MERU_EXTENSIONS_FIXTURE: "1" } });

/** The page the worker asks for a window of, which is one of its own. */
const WINDOW_PAGE_PATH = "popup.html?context=window";

/** 1 is the facade's fake window, so a window really opened is past it. */
const FAKE_WINDOW_ID = 1;

/** Waits until the app has loaded the fixture into the default session. */
async function waitForFixture() {
  await expect
    .poll(async () =>
      meru.app.evaluate(
        ({ session }, { extensionId }) =>
          session.defaultSession.extensions
            .getAllExtensions()
            .some((extension) => extension.id === extensionId),
        { extensionId: FIXTURE_EXTENSION_ID },
      ),
    )
    .toBe(true);
}

/**
 * Opens the fixture's popup in the worker session, which is the page the calls
 * are asked for through, and hands back its id.
 */
async function openWorkerPopup() {
  await waitForFixture();

  return meru.app.evaluate(
    async ({ BrowserWindow }, { extensionId }) => {
      // No partition, so the window runs in the default session, which is where
      // the one worker is
      const popupWindow = new BrowserWindow({ show: false });

      await popupWindow.loadURL(`chrome-extension://${extensionId}/popup.html?context=windows`);

      return popupWindow.webContents.id;
    },
    { extensionId: FIXTURE_EXTENSION_ID },
  );
}

type WindowsReply = {
  method?: string;
  result?: { id?: number } | null;
  lastError?: string | null;
};

/**
 * Asks the worker for one `chrome.windows` call, through an extension page of
 * the worker's own session — natively, with no proxy in the path, so the
 * namespace answering is the worker's own.
 */
async function callInWorker(webContentsId: number, method: string, args: unknown[] = []) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId, method: methodName, args: callArguments }) => {
      const contents = webContents.fromId(contentsId);

      if (!contents) {
        return null;
      }

      return contents.mainFrame.executeJavaScript(
        `new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "windows",
              method: ${JSON.stringify(methodName)},
              args: ${JSON.stringify(callArguments)},
            },
            (reply) => {
              resolve(reply ?? null);
            },
          );
        })`,
      ) as Promise<WindowsReply | null>;
    },
    { webContentsId, method, args },
  );
}

/**
 * The URLs of the windows the app holds, which is how a window is counted. On
 * Windows a closing window stays listed for a moment after its `WebContents`
 * is destroyed, and reading that one's URL throws, so it is counted as gone.
 */
async function readWindowUrls() {
  return meru.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((window) => !window.isDestroyed() && !window.webContents.isDestroyed())
      .map((window) => window.webContents.getURL()),
  );
}

/** The page URL a window of the fixture's own page is counted by. */
function getWindowPageUrl() {
  return `chrome-extension://${FIXTURE_EXTENSION_ID}/${WINDOW_PAGE_PATH}`;
}

/** Closes the popup the test asked its calls through. */
async function closeWorkerPopup(webContentsId: number) {
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

/** The `WebContents` id of the page an extension window shows, once it has loaded. */
async function findWindowPageId() {
  let pageId: number | null = null;

  await expect
    .poll(async () => {
      pageId = await meru.app.evaluate(
        ({ BrowserWindow }, { url }) =>
          BrowserWindow.getAllWindows().find(
            (window) => window.webContents.getURL() === url && !window.webContents.isLoading(),
          )?.webContents.id ?? null,
        { url: getWindowPageUrl() },
      );

      return pageId;
    })
    .not.toBeNull();

  return pageId as unknown as number;
}

/**
 * Runs a script in an extension page's own world, where its `chrome` is — the
 * one the facade completed — and hands back what it resolves to.
 */
async function runInPage<Result>(webContentsId: number, script: string) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId, script: pageScript }) =>
      webContents.fromId(contentsId)?.mainFrame.executeJavaScript(pageScript) ?? null,
    { webContentsId, script },
  ) as Promise<Result | null>;
}

/**
 * The `WebContents` ids of the views Meru is showing, which is what the
 * embedder answers `tabs.Tab.active` from.
 */
async function readVisibleViewIds() {
  return meru.app.evaluate(({ BrowserWindow, WebContentsView }) => {
    const viewIds: number[] = [];

    for (const window of BrowserWindow.getAllWindows()) {
      for (const child of window.contentView.children) {
        if (child instanceof WebContentsView && child.getVisible()) {
          viewIds.push(child.webContents.id);
        }
      }
    }

    return viewIds;
  });
}

/** Opens the fixture's own page in a window, the way a password manager's popout opens. */
async function openExtensionWindow(popupId: number) {
  const created = await callInWorker(popupId, "create", [
    { url: WINDOW_PAGE_PATH, type: "popup", width: 380, height: 630 },
  ]);

  expect(created?.result?.id).toBeGreaterThan(FAKE_WINDOW_ID);

  return { windowId: created?.result?.id as number, pageId: await findWindowPageId() };
}

test("the worker opens one of the extension's own pages in a window", async () => {
  const popupId = await openWorkerPopup();

  const created = await callInWorker(popupId, "create", [
    { url: WINDOW_PAGE_PATH, type: "popup", focused: true, width: 380, height: 630 },
  ]);

  expect(created?.lastError).toBeNull();

  expect(created?.result?.id).toBeGreaterThan(FAKE_WINDOW_ID);

  await expect.poll(readWindowUrls).toContain(getWindowPageUrl());

  // The window the worker asked about, which is how a popout reads its own id
  const got = await callInWorker(popupId, "get", [created?.result?.id, { populate: true }]);

  expect(got?.result?.id).toBe(created?.result?.id as number);

  // A second create for the same page is the window already open, rather than
  // another window of the same unlock
  const recreated = await callInWorker(popupId, "create", [
    { url: WINDOW_PAGE_PATH, type: "popup" },
  ]);

  expect(recreated?.result?.id).toBe(created?.result?.id as number);

  expect((await readWindowUrls()).filter((url) => url === getWindowPageUrl())).toHaveLength(1);

  const removed = await callInWorker(popupId, "remove", [created?.result?.id]);

  expect(removed?.lastError).toBeNull();

  await expect.poll(readWindowUrls).not.toContain(getWindowPageUrl());

  await closeWorkerPopup(popupId);
});

/*
 * A window outside the extension would be a browser window with none of Meru's
 * own handling on it, so the call fails rather than opening one — and in
 * callback form a failed call is `lastError`, which is where the extension
 * hears about it.
 */
test("a window for anything but the extension's own pages is refused", async () => {
  const popupId = await openWorkerPopup();

  const windowUrlsBefore = await readWindowUrls();

  const created = await callInWorker(popupId, "create", [
    { url: "https://example.com/", type: "popup" },
  ]);

  expect(created?.result).toBeNull();

  expect(created?.lastError).toBeTruthy();

  expect(await readWindowUrls()).toEqual(windowUrlsBefore);

  await closeWorkerPopup(popupId);
});

type SeenTab = { id: number; windowId: number; active: boolean; url: string };

/*
 * How Bitwarden closes its unlock and passkey popouts: `tabs.query` for its
 * popup page's URL, then `windows.remove` of each match's `windowId`. Asked
 * from the window's own page, which natively sees only its own session and a
 * `windowId` that names no window `remove` knows.
 */
test("a page finds its own window by URL and closes it", async () => {
  const popupId = await openWorkerPopup();

  const { windowId, pageId } = await openExtensionWindow(popupId);

  const found = await runInPage<SeenTab[]>(
    pageId,
    `chrome.tabs.query({ url: chrome.runtime.getURL("popup.html") + "*" })`,
  );

  const windowPage = found?.find((tab) => tab.url === getWindowPageUrl());

  expect(windowPage).toMatchObject({ id: pageId, windowId });

  // Not awaited in the page, which goes away with its window before it could
  // answer
  await runInPage(pageId, `chrome.windows.remove(${windowId}); null`);

  await expect.poll(readWindowUrls).not.toContain(getWindowPageUrl());

  await closeWorkerPopup(popupId);
});

/*
 * How Bitwarden's popout closes itself once it is done: `windows.getCurrent`
 * from its own page, then `windows.remove` of the id that answered.
 */
test("a page closes its own window with windows.getCurrent and remove", async () => {
  const popupId = await openWorkerPopup();

  const { windowId, pageId } = await openExtensionWindow(popupId);

  expect(await runInPage<{ id: number }>(pageId, "chrome.windows.getCurrent()")).toMatchObject({
    id: windowId,
  });

  // Not awaited in the page, which goes away with its window before it could
  // answer
  await runInPage(
    pageId,
    "chrome.windows.getCurrent().then((window) => chrome.windows.remove(window.id)); null",
  );

  await expect.poll(readWindowUrls).not.toContain(getWindowPageUrl());

  await closeWorkerPopup(popupId);
});

/*
 * An extension window holds the same pages an account session does, under the
 * same allowlist: a notification is allowed, and nothing else beyond the
 * clipboard is.
 */
test("a page in an extension window gets only the extension-page permissions", async () => {
  const popupId = await openWorkerPopup();

  const { windowId, pageId } = await openExtensionWindow(popupId);

  expect(
    await runInPage<string[]>(
      pageId,
      `Promise.all([
        Notification.permission,
        navigator.permissions.query({ name: "geolocation" }).then((status) => status.state),
        Notification.requestPermission(),
      ])`,
    ),
  ).toEqual(["granted", "denied", "granted"]);

  await runInPage(pageId, `chrome.windows.remove(${windowId}); null`);

  await expect.poll(readWindowUrls).not.toContain(getWindowPageUrl());

  await closeWorkerPopup(popupId);
});

/*
 * The popup page in a window of its own, the way Bitwarden's is opened, asks
 * for the active tab of its current window to list what it can fill there.
 * The window stands in for Chrome's toolbar popup, whose current window is the
 * browser window under it, so the answer is the view Meru is showing rather
 * than the popup's own page.
 */
test("a page in an extension window sees the view Meru is showing as the current tab", async () => {
  const popupId = await openWorkerPopup();

  const { windowId, pageId } = await openExtensionWindow(popupId);

  const activeTabs = await runInPage<SeenTab[]>(
    pageId,
    "chrome.tabs.query({ active: true, currentWindow: true })",
  );

  expect(activeTabs).toHaveLength(1);

  const [activeTab] = activeTabs as SeenTab[];

  expect(activeTab?.id).not.toBe(pageId);

  expect(activeTab?.windowId).toBe(FAKE_WINDOW_ID);

  expect(await readVisibleViewIds()).toContain(activeTab?.id);

  // And by id, which is what a popup holding a tab id from its URL asks
  expect(await runInPage<SeenTab>(pageId, `chrome.tabs.get(${activeTab?.id})`)).toMatchObject({
    id: activeTab?.id,
  });

  // The window's own page is in its own window, not the current one
  expect(
    await runInPage<SeenTab[]>(pageId, `chrome.tabs.query({ windowId: ${windowId} })`),
  ).toEqual([expect.objectContaining({ id: pageId })]);

  await runInPage(pageId, `chrome.windows.remove(${windowId}); null`);

  await expect.poll(readWindowUrls).not.toContain(getWindowPageUrl());

  await closeWorkerPopup(popupId);
});

/*
 * Closing the window is the user's doing, not a call of the extension's, and
 * the worker is the context Electron delivers no event to. Bitwarden ends a
 * passkey request on this event when the user closes its popout.
 */
test("the worker and a page hear windows.onRemoved when the user closes an extension window", async () => {
  const popupId = await openWorkerPopup();

  await runInPage(
    popupId,
    `window.removedWindowIds = [];
     chrome.windows.onRemoved.addListener((windowId) => window.removedWindowIds.push(windowId));
     null`,
  );

  const { windowId, pageId } = await openExtensionWindow(popupId);

  await meru.app.evaluate(
    ({ BrowserWindow, webContents }, { webContentsId }) => {
      const contents = webContents.fromId(webContentsId);

      if (contents) {
        BrowserWindow.fromWebContents(contents)?.close();
      }
    },
    { webContentsId: pageId },
  );

  await expect
    .poll(() =>
      runInPage<number[]>(
        popupId,
        `new Promise((resolve) => chrome.runtime.sendMessage(
          { type: "read-removed-windows" },
          (reply) => resolve(reply ? reply.windowIds : []),
        ))`,
      ),
    )
    .toContain(windowId);

  await expect
    .poll(() => runInPage<number[]>(popupId, "window.removedWindowIds"))
    .toEqual([windowId]);

  await closeWorkerPopup(popupId);
});
