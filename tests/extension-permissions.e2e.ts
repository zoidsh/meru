/*
 * `chrome.permissions`, exercised through the checked-in fixture extension
 * (`packages/electron-extensions/fixture`) rather than through a curated one,
 * which needs a real account and a desktop app. Electron ships no `permissions`
 * module at all, so every answer here is the facade's
 * (`facade/api/permissions.ts`) over the grants the main process keeps
 * (`permissions/permissions.ts`).
 *
 * Every call is made in the extension's service worker, asked for over
 * `runtime.sendMessage` from a page of the worker's own session. That is where
 * Bitwarden asks, and it is also the context whose grant has to still be there
 * after a restart — the worker is rebuilt from the derived copy on every
 * launch, so anything it remembers was remembered for it.
 *
 * The launch carries `MERU_EXTENSIONS_FIXTURE`, which puts the bundled fixture
 * into every session of this packaged build, and seeds the master switch on
 * because extensions are off by default. `useProApp` because extensions are
 * Pro, and because a file is entirely one entitlement or the other —
 * `useApp` registers its hooks once at module scope. The app is allowed to
 * grant the fixture `nativeMessaging` and nothing else, which is
 * `getGrantableOptionalPermissions` in `packages/app/extensions.ts` standing in
 * for a catalog entry.
 */
import { FIXTURE_EXTENSION_ID } from "@meru/electron-extensions/fixture/id";
import { expect, test } from "@playwright/test";
import { useProApp } from "./lib/app";

/** `null` is how this file asks for the default session, where the worker runs. */
const WORKER_SESSION = null;

const meru = useProApp({ "extensions.enabled": true }, { env: { MERU_EXTENSIONS_FIXTURE: "1" } });

/** The permission the app allows the fixture, as a catalog entry would. */
const GRANTABLE_PERMISSION = "nativeMessaging";

/** One the fixture declares optional and the app allows it anyway. */
const UNGRANTABLE_PERMISSION = "clipboardRead";

/**
 * Waits until the app has loaded the fixture into the session, which happens as
 * the app comes up: the default session before the accounts.
 */
async function waitForFixture(partition: string | null) {
  await expect
    .poll(async () =>
      meru.app.evaluate(
        ({ session }, { partition: partitionName, extensionId }) =>
          (partitionName === null
            ? session.defaultSession
            : session.fromPartition(partitionName)
          ).extensions
            .getAllExtensions()
            .some((extension) => extension.id === extensionId),
        { partition, extensionId: FIXTURE_EXTENSION_ID },
      ),
    )
    .toBe(true);
}

/** Opens the fixture's popup in the worker session, and hands back its id. */
async function openWorkerPopup() {
  await waitForFixture(WORKER_SESSION);

  return meru.app.evaluate(
    async ({ BrowserWindow }, { extensionId }) => {
      // No partition, so the window runs in the default session, which is where
      // the one worker is
      const popupWindow = new BrowserWindow({ show: false });

      await popupWindow.loadURL(`chrome-extension://${extensionId}/popup.html?context=permissions`);

      return popupWindow.webContents.id;
    },
    { extensionId: FIXTURE_EXTENSION_ID },
  );
}

type PermissionsReply = {
  method?: string;
  result?: unknown;
};

/**
 * Asks the worker for one `chrome.permissions` call, through an extension page
 * of the worker's own session — natively, with no proxy in the path, so the
 * namespace answering is the worker's own.
 */
async function callInWorker(webContentsId: number, method: string, permissions: string[] = []) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId, method: methodName, permissions: names }) => {
      const contents = webContents.fromId(contentsId);

      if (!contents) {
        return null;
      }

      return contents.mainFrame.executeJavaScript(
        `new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "permissions",
              method: ${JSON.stringify(methodName)},
              permissions: ${JSON.stringify(names)},
            },
            (reply) => {
              resolve(reply ?? null);
            },
          );
        })`,
      ) as Promise<PermissionsReply | null>;
    },
    { webContentsId, method, permissions },
  );
}

test("a grant the worker asked for outlives the app that made it", async () => {
  const popupId = await openWorkerPopup();

  // The honest answer before anything is granted, which is the one that keeps
  // an extension off a path Meru cannot serve
  expect((await callInWorker(popupId, "contains", [GRANTABLE_PERMISSION]))?.result).toBe(false);

  expect((await callInWorker(popupId, "request", [GRANTABLE_PERMISSION]))?.result).toBe(true);

  expect((await callInWorker(popupId, "contains", [GRANTABLE_PERMISSION]))?.result).toBe(true);

  await meru.relaunch();

  // A new app, a new worker, and a popup of its own to ask through
  const relaunchedPopupId = await openWorkerPopup();

  expect((await callInWorker(relaunchedPopupId, "contains", [GRANTABLE_PERMISSION]))?.result).toBe(
    true,
  );

  expect((await callInWorker(relaunchedPopupId, "getAll"))?.result).toMatchObject({
    permissions: expect.arrayContaining(["storage", GRANTABLE_PERMISSION]),
  });

  expect((await callInWorker(relaunchedPopupId, "remove", [GRANTABLE_PERMISSION]))?.result).toBe(
    true,
  );

  expect((await callInWorker(relaunchedPopupId, "contains", [GRANTABLE_PERMISSION]))?.result).toBe(
    false,
  );
});

test("a request for a permission the app does not allow is declined", async () => {
  const popupId = await openWorkerPopup();

  expect((await callInWorker(popupId, "request", [UNGRANTABLE_PERMISSION]))?.result).toBe(false);

  expect((await callInWorker(popupId, "contains", [UNGRANTABLE_PERMISSION]))?.result).toBe(false);

  // A permission the manifest never declared optional fails the call, so the
  // callback is answered with no result, as Chrome answers it
  const undeclaredReply = await callInWorker(popupId, "request", ["bookmarks"]);

  expect(undeclaredReply?.method).toBe("request");

  expect(undeclaredReply?.result).toBeUndefined();
});

test("the permissions the manifest requires are the ones the worker holds", async () => {
  const popupId = await openWorkerPopup();

  expect((await callInWorker(popupId, "contains", ["storage"]))?.result).toBe(true);

  expect((await callInWorker(popupId, "getAll"))?.result).toEqual({
    permissions: ["storage", "scripting"],
    origins: [],
  });

  // Chrome fails a call that removes a required permission
  const requiredReply = await callInWorker(popupId, "remove", ["storage"]);

  expect(requiredReply?.method).toBe("remove");

  expect(requiredReply?.result).toBeUndefined();

  expect((await callInWorker(popupId, "contains", ["storage"]))?.result).toBe(true);
});
