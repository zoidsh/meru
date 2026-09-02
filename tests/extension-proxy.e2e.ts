/*
 * The runtime proxy, exercised through the checked-in fixture extension
 * (`packages/electron-extensions/fixture`) — the only automated coverage the
 * shared extension instance has, since 1Password needs a real Google account,
 * the desktop app and a display.
 *
 * The launch carries both extension flags: `MERU_EXTENSIONS_FIXTURE` puts the
 * bundled fixture into every account session of this packaged build, and
 * `MERU_EXTENSIONS_SHARED_INSTANCE` turns on the shared instance, so the
 * first account's session keeps the fixture's service worker while the second
 * account's session gets the content-script-only copy whose `chrome.runtime`
 * messaging the proxy relays. Two accounts need Pro, which is why this file
 * launches through `useProApp` — and a file is entirely one entitlement or
 * the other, because `useApp` registers its hooks once at module scope.
 *
 * Every probe context — a popup, a content script, an embedded extension
 * frame — runs the same suite (`fixture/probes.ts`) and writes its results
 * into a `data-` attribute on its document, where these tests read them
 * through the main process. The windows the probes run in are created here
 * rather than through the app's UI: which surfaces open extension pages is
 * the embedder's business, and what is under test is the messaging layer
 * those surfaces would sit on.
 *
 * Worker lifetime is deliberately not covered. Playwright's launch attaches a
 * CDP debugger that disables Chromium's MV3 idle timer, so from this suite a
 * worker reads as permanently alive whether it is or not — a lifetime test
 * here would be confidently wrong rather than failing.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { FIXTURE_EXTENSION_ID } from "@meru/electron-extensions/fixture/id";
import type { ProbeResults } from "@meru/electron-extensions/fixture/probes";
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

/*
 * The first account's session is the one the shared instance hands the worker
 * role, because sessions adopt roles in the order they are set up and accounts
 * are constructed in config order. The tests do not take that on faith: the
 * copy each session got is asserted from its own manifest.
 */
const WORKER_PARTITION = "persist:worker-account";

const SHIM_PARTITION = "persist:shim-account";

const meru = useProApp(
  {
    accounts: [account("worker-account", "Worker", true), account("shim-account", "Shim", false)],
  },
  { env: { MERU_EXTENSIONS_FIXTURE: "1", MERU_EXTENSIONS_SHARED_INSTANCE: "1" } },
);

/**
 * The pages the fixture's content scripts inject into, served from this test
 * process — which is the whole reason the fixture's `matches` are loopback
 * only. The extension frame's URL needs no port, so every page body is static.
 */
const SERVED_PAGES: Record<string, string> = {
  "/plain":
    "<!doctype html><html><head><meta charset='utf-8'><title>plain</title></head><body>plain</body></html>",
  /*
   * The strictest policy a page can declare: no connect-src at all. The
   * fixture's content script still has to reach the worker through the
   * bridge, because the page's own policy does not govern the extension's
   * isolated world — 1Password's popup taught this layer that lesson once.
   */
  "/csp":
    "<!doctype html><html><head><meta charset='utf-8'><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'\"><title>csp</title></head><body>csp</body></html>",
  "/frame": `<!doctype html><html><head><meta charset='utf-8'><title>frame</title></head><body><iframe src="chrome-extension://${FIXTURE_EXTENSION_ID}/fixture-frame.html"></iframe></body></html>`,
  "/same":
    "<!doctype html><html><head><meta charset='utf-8'><title>same</title></head><body>same</body></html>",
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

/**
 * Waits until the app has loaded the fixture into the session, which happens
 * while the accounts come up. `fromPartition` returns the session the app
 * uses for that account, creating an empty one only until the app gets there
 * — either way the poll only reads.
 */
async function waitForFixture(partition: string) {
  await expect
    .poll(() =>
      meru.app.evaluate(
        ({ session }, { partition: partitionName, extensionId }) =>
          session
            .fromPartition(partitionName)
            .extensions.getAllExtensions()
            .some((extension) => extension.id === extensionId),
        { partition, extensionId: FIXTURE_EXTENSION_ID },
      ),
    )
    .toBe(true);
}

/** Opens a hidden window in the session and resolves to its WebContents id. */
async function openProbeWindow(partition: string, url: string) {
  await waitForFixture(partition);

  return meru.app.evaluate(
    async ({ BrowserWindow }, { partition: partitionName, url: probeUrl }) => {
      const probeWindow = new BrowserWindow({
        show: false,
        webPreferences: { partition: partitionName },
      });

      await probeWindow.loadURL(probeUrl);

      return probeWindow.webContents.id;
    },
    { partition, url },
  );
}

/**
 * Reads a context's probe results off its document, through the main process
 * rather than through a Playwright page: an attribute crosses the isolated
 * world, and reading it needs no assumptions about which windows Playwright
 * has discovered. `frameUrlPrefix` picks a subframe — the embedded extension
 * frame — instead of the main frame.
 */
async function readProbeResults(webContentsId: number, frameUrlPrefix?: string) {
  let serializedResults: string | null = null;

  await expect
    .poll(async () => {
      serializedResults = await meru.app.evaluate(
        ({ webContents }, { webContentsId: contentsId, frameUrlPrefix: urlPrefix }) => {
          const contents = webContents.fromId(contentsId);

          if (!contents) {
            return null;
          }

          const frame = urlPrefix
            ? contents.mainFrame.frames.find((candidate) => candidate.url.startsWith(urlPrefix))
            : contents.mainFrame;

          if (!frame) {
            return null;
          }

          return frame.executeJavaScript(
            'document.documentElement.getAttribute("data-meru-fixture-results")',
          ) as Promise<string | null>;
        },
        { webContentsId, frameUrlPrefix },
      );

      return serializedResults;
    })
    .not.toBeNull();

  return JSON.parse(serializedResults as unknown as string) as ProbeResults;
}

/** Navigates a probe window that is already open, the way a page leaves. */
async function navigateProbeWindow(webContentsId: number, url: string) {
  await meru.app.evaluate(
    async ({ webContents }, { webContentsId: contentsId, url: nextUrl }) => {
      await webContents.fromId(contentsId)?.loadURL(nextUrl);
    },
    { webContentsId, url },
  );
}

/**
 * The worker's port event log, read through an extension page of the worker's
 * own session — natively, with no proxy in the path, so what it reports is the
 * worker's own view. A context that has gone away cannot report for itself,
 * which is the whole point of asking the worker instead.
 */
async function readWorkerPortEvents(webContentsId: number) {
  return meru.app.evaluate(
    ({ webContents }, { webContentsId: contentsId }) => {
      const contents = webContents.fromId(contentsId);

      if (!contents) {
        return [];
      }

      return contents.mainFrame.executeJavaScript(
        `new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "read-events" }, (reply) => {
            resolve(reply && reply.events ? reply.events : []);
          });
        })`,
      ) as Promise<string[]>;
    },
    { webContentsId },
  );
}

function popupUrl(context: string) {
  return `chrome-extension://${FIXTURE_EXTENSION_ID}/popup.html?context=${context}`;
}

/** The reply an echo probe records, with the sender the proxy reconstructed. */
function echoReply(
  results: ProbeResults,
  workerInstanceId: unknown,
  sender: Record<string, unknown>,
) {
  return {
    status: "replied",
    reply: {
      type: "echo-reply",
      nonce: `echo:${results.contextId}`,
      workerInstanceId,
      sender,
    },
  };
}

test("both sessions' popups reach the one worker the first session keeps", async () => {
  const workerPopupId = await openProbeWindow(WORKER_PARTITION, popupUrl("worker-popup"));

  const shimPopupId = await openProbeWindow(SHIM_PARTITION, popupUrl("shim-popup"));

  const workerPopup = await readProbeResults(workerPopupId);

  const shimPopup = await readProbeResults(shimPopupId);

  // Which copy each session got, read from the manifest each context sees:
  // the worker session keeps the whole extension, every other session a copy
  // with no background at all
  expect(workerPopup.manifestHasBackground).toBe(true);

  expect(shimPopup.manifestHasBackground).toBe(false);

  expect(workerPopup.extensionId).toBe(FIXTURE_EXTENSION_ID);

  expect(shimPopup.extensionId).toBe(FIXTURE_EXTENSION_ID);

  /*
   * The worker session's popup messages its own worker natively, with no
   * proxy in the path, which makes its reply the ground truth for which
   * worker instance exists. Its sender is Electron's own shape rather than
   * the proxy's, so only the reply's identity is asserted here.
   */
  expect(workerPopup.echo.status).toBe("replied");

  const workerReply = (workerPopup.echo as { reply: { nonce: string; workerInstanceId: string } })
    .reply;

  expect(workerReply.nonce).toBe(`echo:${workerPopup.contextId}`);

  expect(workerReply.workerInstanceId).toEqual(expect.any(String));

  /*
   * The shim session's popup has no worker in its own session to answer — its
   * copy carries none — so a reply at all is cross-session relay, and the
   * matching `workerInstanceId` pins it to the same worker instance the
   * worker session's popup reached. The sender is the proxy's whole contract
   * for an extension page: URL and origin, and deliberately no tab.
   */
  expect(shimPopup.echo).toEqual(
    echoReply(shimPopup, workerReply.workerInstanceId, {
      url: popupUrl("shim-popup"),
      origin: `chrome-extension://${FIXTURE_EXTENSION_ID}`,
      frameId: null,
      hasTab: false,
      tabId: null,
      tabUrl: null,
    }),
  );
});

test("content scripts inject into the shim session and round-trip, a strict page CSP included", async () => {
  const plainPageUrl = `${serverOrigin}/plain`;

  const cspPageUrl = `${serverOrigin}/csp`;

  const plainPageId = await openProbeWindow(SHIM_PARTITION, plainPageUrl);

  const cspPageId = await openProbeWindow(SHIM_PARTITION, cspPageUrl);

  // The results existing at all is the injection claim: the only thing that
  // writes them into a loopback page is the fixture's content script, and the
  // only copy in this session is the content-script-only one
  const plainPage = await readProbeResults(plainPageId);

  const cspPage = await readProbeResults(cspPageId);

  expect(plainPage.manifestHasBackground).toBe(false);

  expect(plainPage.echo).toEqual(
    echoReply(plainPage, expect.any(String), {
      url: plainPageUrl,
      origin: serverOrigin,
      frameId: 0,
      hasTab: true,
      tabId: plainPageId,
      tabUrl: plainPageUrl,
    }),
  );

  // The page's own `default-src 'none'` has no say over the content script's
  // path to the worker
  expect(cspPage.echo).toEqual(
    echoReply(cspPage, expect.any(String), {
      url: cspPageUrl,
      origin: serverOrigin,
      frameId: 0,
      hasTab: true,
      tabId: cspPageId,
      tabUrl: cspPageUrl,
    }),
  );
});

test("ports relay both ways and both ends observe a disconnect", async () => {
  const pageUrl = `${serverOrigin}/plain`;

  const pageId = await openProbeWindow(SHIM_PARTITION, pageUrl);

  const page = await readProbeResults(pageId);

  // marco went shim-to-worker, polo came worker-to-shim, and the connect
  // carried the same reconstructed sender a message does
  expect(page.port).toEqual({
    status: "replied",
    reply: {
      type: "polo",
      nonce: `marco:${page.contextId}`,
      workerInstanceId: expect.any(String),
      portName: `marco:${page.contextId}`,
      sender: {
        url: pageUrl,
        origin: serverOrigin,
        frameId: 0,
        hasTab: true,
        tabId: pageId,
        tabUrl: pageUrl,
      },
    },
  });

  // The worker closing a port reaches the shim end as its onDisconnect
  expect(page.workerClosedPort).toBe(true);

  // The shim closing a port reaches the worker end as that port's
  // onDisconnect, observed through the worker's own event log
  expect(page.selfCloseSeenByWorker).toBe(true);
});

test("a page navigating away disconnects the port it left open", async () => {
  /*
   * The one path that closes a shim port whose page went away without
   * disconnecting is `ReadableStream.cancel` on the connect response, and that
   * it fires at all is Electron's behavior rather than this layer's — which is
   * why it is pinned here rather than assumed. Without it the worker never
   * hears `onDisconnect` and both port maps grow by one per navigation.
   *
   * The shim cannot cover for it. A bridge POST started from the departing
   * context — a `pagehide` handler, `keepalive` or not — never reaches main:
   * an unload-time request on this scheme is dropped with the frame, measured
   * with this same case and the cancel handler compiled out.
   */
  const observerPopupId = await openProbeWindow(WORKER_PARTITION, popupUrl("navigation-observer"));

  const pageId = await openProbeWindow(SHIM_PARTITION, `${serverOrigin}/plain`);

  const page = await readProbeResults(pageId);

  expect(page.openPortName).toBe(`left-open:${page.contextId}`);

  const openPortDisconnect = `disconnect:${page.openPortName}`;

  // Nothing in the page closes this port, so the worker has no business
  // seeing it disconnect while the page is still there
  expect(await readWorkerPortEvents(observerPopupId)).not.toContain(openPortDisconnect);

  await navigateProbeWindow(pageId, "about:blank");

  await expect.poll(() => readWorkerPortEvents(observerPopupId)).toContain(openPortDisconnect);
});

test("a message is attributed to the frame that sent it, an embedded extension frame included", async () => {
  const samePageUrl = `${serverOrigin}/same`;

  /*
   * Two tabs of one session on the same URL, which is exactly the case where
   * nothing but the caller stamp can tell the senders apart: each message
   * must carry its own tab's id, not the other's. The WebContents ids the
   * windows were created with are what the proxy's tab ids are defined to be.
   */
  const firstSameId = await openProbeWindow(SHIM_PARTITION, samePageUrl);

  const secondSameId = await openProbeWindow(SHIM_PARTITION, samePageUrl);

  const firstSame = await readProbeResults(firstSameId);

  const secondSame = await readProbeResults(secondSameId);

  expect(firstSame.echo).toEqual(
    echoReply(firstSame, expect.any(String), {
      url: samePageUrl,
      origin: serverOrigin,
      frameId: 0,
      hasTab: true,
      tabId: firstSameId,
      tabUrl: samePageUrl,
    }),
  );

  expect(secondSame.echo).toEqual(
    echoReply(secondSame, expect.any(String), {
      url: samePageUrl,
      origin: serverOrigin,
      frameId: 0,
      hasTab: true,
      tabId: secondSameId,
      tabUrl: samePageUrl,
    }),
  );

  /*
   * An extension page embedded as an iframe of a web page — the
   * web_accessible_resources path, and the one extension-page shape that does
   * carry a tab: the host page's, with a subframe id of its own.
   */
  const frameHostUrl = `${serverOrigin}/frame`;

  const frameHostId = await openProbeWindow(SHIM_PARTITION, frameHostUrl);

  const embeddedFrameUrl = `chrome-extension://${FIXTURE_EXTENSION_ID}/fixture-frame.html`;

  const embeddedFrame = await readProbeResults(frameHostId, embeddedFrameUrl);

  expect(embeddedFrame.echo).toEqual(
    echoReply(embeddedFrame, expect.any(String), {
      url: embeddedFrameUrl,
      origin: `chrome-extension://${FIXTURE_EXTENSION_ID}`,
      frameId: expect.any(Number),
      hasTab: true,
      tabId: frameHostId,
      tabUrl: frameHostUrl,
    }),
  );

  const embeddedFrameSender = (embeddedFrame.echo as { reply: { sender: { frameId: number } } })
    .reply.sender;

  // A subframe is never frame 0; 0 would mean the proxy attributed the
  // message to the host document rather than the extension frame
  expect(embeddedFrameSender.frameId).toBeGreaterThan(0);
});
