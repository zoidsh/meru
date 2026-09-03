/*
 * The block on the extension worker's telemetry, exercised through the
 * checked-in fixture extension (`packages/electron-extensions/fixture`) rather
 * than through 1Password, which needs a real account, the desktop app and a
 * display. What is under test is the loader's listener and not the catalog:
 * the listener is attached to the session, so whichever extension the worker
 * session happens to hold is the one whose requests it cancels — and the
 * fixture is the one that can be asked to make a request on demand.
 *
 * The launch carries `MERU_EXTENSIONS_FIXTURE`, which puts the bundled fixture
 * into every session of this packaged build, seeds the master switch on
 * because extensions are off by default, and goes through `useProApp`
 * because a file is entirely one entitlement or the other — `useApp` registers
 * its hooks once at module scope. One account is enough here: the worker runs
 * in the default session, which no account owns, so nothing about this changes
 * with a second.
 *
 * Every assertion is on `net::ERR_BLOCKED_BY_CLIENT` rather than on the fetch
 * having failed. A fetch to a host this machine cannot resolve fails too, so a
 * test that only asked whether the request failed would pass on a sandbox with
 * no network and mean nothing; the error code is what separates Meru
 * canceling the request from the network never carrying it.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { FIXTURE_EXTENSION_ID } from "@meru/electron-extensions/fixture/id";
import { curatedExtensions } from "@meru/shared/extensions";
import { expect, test } from "@playwright/test";
import { useProApp } from "./lib/app";

/** The account the app comes up with, in the shape `pro.e2e.ts` seeds. */
function account(id: string, label: string) {
  return {
    id,
    label,
    color: null,
    selected: true,
    notifications: true,
    gmail: { unreadBadge: true, delegatedAccountId: null, unifiedInbox: true },
    workspaceApps: { savedTabs: [], bookmarks: [] },
  };
}

/** `null` is how a probe asks for the default session, where the worker runs. */
const WORKER_SESSION = null;

const meru = useProApp(
  { "extensions.enabled": true, accounts: [account("only-account", "Only")] },
  { env: { MERU_EXTENSIONS_FIXTURE: "1" } },
);

/**
 * A URL under the first telemetry pattern the catalog carries, read from the
 * catalog rather than written out again: what the app blocks is exactly this
 * list, so a pattern that were dropped from it would fail this test rather
 * than leave it asserting against a host nothing blocks any more.
 */
function firstTelemetryUrl() {
  const [telemetryPattern] = curatedExtensions.flatMap(
    (curatedExtension) => curatedExtension.telemetryUrls ?? [],
  );

  if (!telemetryPattern) {
    throw new Error("No curated extension names a telemetry URL to block");
  }

  return telemetryPattern.replace(/\*$/, "probe");
}

type RequestError = { url: string; error: string };

/** The loopback server the control request is aimed at. */
let server: http.Server;

let serverOrigin: string;

test.beforeAll(async () => {
  server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" }).end("ok");
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

/**
 * Waits until the app has loaded the fixture into the session, which is also
 * when the loader has attached the block: both happen in `setupSession`.
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

/**
 * Starts recording how the worker session's failed requests failed, which is
 * the only place the error code is legible: the worker itself sees the same
 * `TypeError` for every failure, by design of `fetch`.
 */
async function recordRequestErrors() {
  await meru.app.evaluate(({ session }) => {
    const mainGlobals = globalThis as unknown as { meruRequestErrors?: RequestError[] };

    mainGlobals.meruRequestErrors = [];

    session.defaultSession.webRequest.onErrorOccurred({ urls: ["<all_urls>"] }, (details) => {
      mainGlobals.meruRequestErrors?.push({ url: details.url, error: details.error });
    });
  });
}

async function readRequestErrors() {
  return meru.app.evaluate(() => {
    const mainGlobals = globalThis as unknown as { meruRequestErrors?: RequestError[] };

    return mainGlobals.meruRequestErrors ?? [];
  });
}

/** Opens the fixture's popup in the worker session, and hands back its id. */
async function openWorkerPopup() {
  await waitForFixture(WORKER_SESSION);

  return meru.app.evaluate(
    async ({ BrowserWindow }, { extensionId }) => {
      // No partition, so the window runs in the default session, which is where
      // the one worker is
      const popupWindow = new BrowserWindow({ show: false });

      await popupWindow.loadURL(`chrome-extension://${extensionId}/popup.html?context=telemetry`);

      return popupWindow.webContents.id;
    },
    { extensionId: FIXTURE_EXTENSION_ID },
  );
}

/**
 * Asks the worker to fetch a URL, through an extension page of the worker's
 * own session — natively, with no proxy in the path. The request is the
 * worker's own, made in the session the block is attached to, which is the
 * whole point: a page's fetch would be made by the page.
 */
async function fetchFromWorker(webContentsId: number, url: string) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId, url: fetchUrl }) => {
      const contents = webContents.fromId(contentsId);

      if (!contents) {
        return null;
      }

      return contents.mainFrame.executeJavaScript(
        `new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: "fetch-url", url: ${JSON.stringify(fetchUrl)} },
            (reply) => {
              resolve(reply ?? null);
            },
          );
        })`,
      ) as Promise<{ status?: string; message?: string } | null>;
    },
    { webContentsId, url },
  );
}

test("the worker's telemetry request is canceled before it leaves the machine", async () => {
  const telemetryUrl = firstTelemetryUrl();

  await recordRequestErrors();

  const popupId = await openWorkerPopup();

  const reply = await fetchFromWorker(popupId, telemetryUrl);

  expect(reply?.status).toBe("error");

  /*
   * Polled, because `onErrorOccurred` is the last thing the network stack
   * reports and the worker's `fetch` can reject a moment before it. The code
   * is what makes this a block rather than a failed lookup.
   */
  await expect
    .poll(async () =>
      (await readRequestErrors()).find((requestError) => requestError.url === telemetryUrl),
    )
    .toEqual({ url: telemetryUrl, error: "net::ERR_BLOCKED_BY_CLIENT" });
});

test("the worker's other requests go out untouched", async () => {
  const controlUrl = `${serverOrigin}/probe`;

  await recordRequestErrors();

  const popupId = await openWorkerPopup();

  const reply = await fetchFromWorker(popupId, controlUrl);

  // The filter is what does the matching, so a request outside it never
  // reaches the listener at all — and this one is answered by a server in this
  // test process, which is what makes "it resolved" mean the request went out
  expect(reply?.status).toBe("ok");

  // For this URL rather than for none at all: the app makes requests of its
  // own in this session, and an update check that fails says nothing about the
  // block
  expect(
    (await readRequestErrors()).filter((requestError) => requestError.url === controlUrl),
  ).toEqual([]);
});
