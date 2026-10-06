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

/** The URLs of the windows the app holds, which is how a window is counted. */
async function readWindowUrls() {
  return meru.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => window.webContents.getURL()),
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
