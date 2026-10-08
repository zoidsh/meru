/*
 * `chrome.tabs.update` on an account's tab, from the worker and from a page of
 * the worker's session, exercised through the checked-in fixture extension.
 * Electron's own `tabs.update` looks ids up in the worker's session, which
 * holds no account's tab, so what answers is main (`runtime-proxy/worker-tabs.ts`),
 * for an extension opted into windows the way Bitwarden is.
 *
 * Two accounts, so that bringing one's tab to the front is something a test
 * can see: only the selected account's view is showing. Two accounts need Pro,
 * which `useProApp` gives.
 */
import { FIXTURE_EXTENSION_ID } from "@meru/electron-extensions/fixture/id";
import { expect, test } from "@playwright/test";
import { useProApp } from "./lib/app";

/** The shape `accounts` is stored in, as in `pro.e2e.ts`. */
function account(id: string, label: string, selected: boolean) {
  return {
    id,
    label,
    color: null,
    selected,
    notifications: true,
    gmail: { unreadBadge: true, delegatedAccountId: null, unifiedInbox: true },
    workspaceApps: { savedTabs: [], bookmarks: [] },
  };
}

const meru = useProApp(
  {
    "extensions.enabled": true,
    accounts: [account("first-account", "First", true), account("second-account", "Second", false)],
  },
  { env: { MERU_EXTENSIONS_FIXTURE: "1" } },
);

type UpdateReply = {
  result?: { id?: number; active?: boolean } | null;
  lastError?: string | null;
};

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
 * Opens the fixture's popup in the worker session, the page calls are made
 * from or asked for through, and hands back its id.
 */
async function openWorkerPopup() {
  await waitForFixture();

  return meru.app.evaluate(
    async ({ BrowserWindow }, { extensionId }) => {
      const popupWindow = new BrowserWindow({ show: false });

      await popupWindow.loadURL(`chrome-extension://${extensionId}/popup.html?context=tabs-update`);

      return popupWindow.webContents.id;
    },
    { extensionId: FIXTURE_EXTENSION_ID },
  );
}

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

/** Runs a script in a page's own world, where its `chrome` is. */
async function runInPage<Result>(webContentsId: number, script: string) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId, script: pageScript }) =>
      webContents.fromId(contentsId)?.mainFrame.executeJavaScript(pageScript) ?? null,
    { webContentsId, script },
  ) as Promise<Result | null>;
}

/** Asks the worker for one `tabs.update`, through a page of its session. */
async function updateInWorker(popupId: number, tabId: number, updateProperties: unknown) {
  return runInPage<UpdateReply>(
    popupId,
    `new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "tabs-update", args: [${tabId}, ${JSON.stringify(updateProperties)}] },
        (reply) => {
          resolve(reply ?? null);
        },
      );
    })`,
  );
}

/** The `WebContents` id of an account's Gmail view, by the account's partition. */
async function readAccountViewId(accountId: string) {
  return meru.app.evaluate(
    ({ session, webContents }, { partition }) =>
      webContents
        .getAllWebContents()
        .find((contents) => contents.session === session.fromPartition(partition))?.id ?? null,
    { partition: `persist:${accountId}` },
  );
}

/**
 * The `WebContents` id of the view in front, which is how Meru shows the
 * selected account: every account's view stays in the window, and the
 * selected one's is put on top.
 */
async function readFrontViewId() {
  return meru.app.evaluate(({ BrowserWindow, WebContentsView }) => {
    const mainWindow = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes("main.html"),
    );

    const views = (mainWindow?.contentView.children ?? []).filter(
      (child) => child instanceof WebContentsView && child.getVisible(),
    ) as InstanceType<typeof WebContentsView>[];

    return views.at(-1)?.webContents.id ?? null;
  });
}

async function readViewUrl(webContentsId: number) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId }) =>
      webContents.fromId(contentsId)?.getURL() ?? null,
    { webContentsId },
  );
}

test("the worker and a page of its session bring an account's tab to the front", async () => {
  const popupId = await openWorkerPopup();

  const firstViewId = (await readAccountViewId("first-account")) as number;

  const secondViewId = (await readAccountViewId("second-account")) as number;

  expect(firstViewId).toEqual(expect.any(Number));

  expect(secondViewId).toEqual(expect.any(Number));

  await expect.poll(readFrontViewId).toBe(firstViewId);

  // Bitwarden's own call, in callback form, on a tab its session can't see
  expect(await updateInWorker(popupId, secondViewId, { active: true, highlighted: true })).toEqual({
    type: "tabs-update-reply",
    result: expect.objectContaining({ id: secondViewId, active: true }),
    lastError: null,
  });

  await expect.poll(readFrontViewId).toBe(secondViewId);

  // And from a page of the worker's session, in promise form
  expect(
    await runInPage<{ id?: number; active?: boolean }>(
      popupId,
      `chrome.tabs.update(${firstViewId}, { active: true })`,
    ),
  ).toEqual(expect.objectContaining({ id: firstViewId, active: true }));

  await expect.poll(readFrontViewId).toBe(firstViewId);

  await closeWorkerPopup(popupId);
});

test("tabs.update refuses to navigate an account's tab, and fails Chrome's way for no tab", async () => {
  const popupId = await openWorkerPopup();

  const secondViewId = (await readAccountViewId("second-account")) as number;

  expect(
    await updateInWorker(popupId, secondViewId, { url: "https://example.com/", active: true }),
  ).toEqual({
    type: "tabs-update-reply",
    result: null,
    lastError: `Cannot change the URL of tab with id: ${secondViewId}.`,
  });

  expect(await readViewUrl(secondViewId)).not.toContain("example.com");

  expect(await readFrontViewId()).not.toBe(secondViewId);

  expect(await updateInWorker(popupId, 999_999, { active: true })).toEqual({
    type: "tabs-update-reply",
    result: null,
    lastError: "No tab with id: 999999.",
  });

  await closeWorkerPopup(popupId);
});
