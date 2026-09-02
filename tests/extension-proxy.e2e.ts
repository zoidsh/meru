/*
 * The runtime proxy, exercised through the checked-in fixture extension
 * (`packages/electron-extensions/fixture`) — the only automated coverage the
 * shared extension instance has, since 1Password needs a real Google account,
 * the desktop app and a display.
 *
 * The launch carries one extension flag: `MERU_EXTENSIONS_FIXTURE` puts the
 * bundled fixture into every account session of this packaged build. The
 * shared instance needs no flag, because it is how Meru runs extensions — the
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
  { env: { MERU_EXTENSIONS_FIXTURE: "1" } },
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

function popupUrl(context: string, { probeStorageChanges = false } = {}) {
  const flag = probeStorageChanges ? "&meruProbeStorageChanges=1" : "";

  return `chrome-extension://${FIXTURE_EXTENSION_ID}/popup.html?context=${context}${flag}`;
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

  // The two sessions load different copies — the worker session the whole
  // extension, every other session one derived with no `background` at all —
  // and `getManifest` is where that would otherwise show. The worker session's
  // answer is native and therefore the ground truth; the shim session's is the
  // shim's, and the two agreeing is the claim
  expect(workerPopup.manifest).toMatchObject({
    background: { service_worker: "chrome-facade-service-worker.js" },
    // Chromium localized the manifest as it loaded the copy, which the derive
    // never sees: the file says `__MSG_extName__` and carries no
    // `current_locale`
    name: "Meru fixture",
    current_locale: expect.any(String),
  });

  expect(shimPopup.manifest).toEqual(workerPopup.manifest);

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

  const workerPageId = await openProbeWindow(WORKER_PARTITION, plainPageUrl);

  // The results existing at all is the injection claim: the only thing that
  // writes them into a loopback page is the fixture's content script, and the
  // only copy in this session is the content-script-only one
  const plainPage = await readProbeResults(plainPageId);

  const cspPage = await readProbeResults(cspPageId);

  // A content script's isolated world answers the worker copy's manifest too,
  // which is the same shim in the other place it runs — held against the
  // worker session's own content script rather than a shape, so the
  // localization Chromium did is part of what has to agree
  expect(plainPage.manifest).toEqual((await readProbeResults(workerPageId)).manifest);

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

test("the worker reaches a shimmed content script it never heard from first", async () => {
  const pageUrl = `${serverOrigin}/plain`;

  const pageId = await openProbeWindow(SHIM_PARTITION, pageUrl);

  const page = await readProbeResults(pageId);

  /*
   * `chrome.tabs.sendMessage` from the worker into a tab of another session,
   * which natively reaches nothing: the worker's own `chrome.tabs` addresses
   * its session's tabs alone. What proves it arrived is the content script's
   * own record of hearing it, and what proves the answer came back is the
   * worker reporting the pong the content script sent.
   */
  expect(page.workerSentBack.heard).toEqual({
    type: "ping-from-worker",
    nonce: `send-back:${page.contextId}`,
    workerInstanceId: expect.any(String),
  });

  expect(page.workerSentBack.outcome).toEqual({
    status: "replied",
    reply: { type: "pong", nonce: `send-back:${page.contextId}`, contextId: page.contextId },
  });

  // The sender a worker-originated message carries is the extension itself:
  // an id and an origin, and no tab, there being no page behind a worker
  expect(page.workerSentBack.sender).toEqual({
    id: FIXTURE_EXTENSION_ID,
    origin: `chrome-extension://${FIXTURE_EXTENSION_ID}`,
    hasTab: false,
  });

  // And the same direction as a port: `chrome.tabs.connect` from the worker,
  // whose first message the content script heard on the port it was handed
  expect(page.workerConnectedBack.heard).toEqual({
    type: "ping-from-worker",
    nonce: `connect-back:${page.contextId}`,
    workerInstanceId: expect.any(String),
  });

  expect(page.workerConnectedBack.outcome).toEqual({
    status: "replied",
    reply: `from-worker:connect-back:${page.contextId}`,
  });

  // And the port carries the page's answer back, which only the worker can
  // see: the answering side has nothing of its own left to observe
  expect(page.portReplySeenByWorker).toBe(true);
});

test("an action popup is no tab, and the worker says so rather than guessing", async () => {
  const shimPopupId = await openProbeWindow(SHIM_PARTITION, popupUrl("shim-popup-no-tab"));

  const shimPopup = await readProbeResults(shimPopupId);

  // Chrome gives an action popup's messages no `sender.tab`, so there is no
  // tab id for the worker to send back into — which the worker reports rather
  // than sending into whatever tab happens to be in front
  expect(shimPopup.workerSentBack.heard).toBeNull();

  expect(shimPopup.workerSentBack.outcome).toEqual({
    status: "error",
    message: "The sender carried no tab",
  });
});

test("storage is one store: the shim session's contexts read and write the worker's", async () => {
  const workerPopupId = await openProbeWindow(WORKER_PARTITION, popupUrl("worker-storage"));

  const shimPopupId = await openProbeWindow(SHIM_PARTITION, popupUrl("shim-storage"));

  const pageId = await openProbeWindow(SHIM_PARTITION, `${serverOrigin}/same`);

  const workerPopup = await readProbeResults(workerPopupId);

  const shimPopup = await readProbeResults(shimPopupId);

  const contentScript = await readProbeResults(pageId);

  /*
   * The worker session's popup reads its own session's store with no proxy in
   * the path, so its stamp is the ground truth for what the one store holds.
   */
  expect(workerPopup.workerStampInLocal.status).toBe("read");

  const workerStamp = (workerPopup.workerStampInLocal as { value: unknown }).value;

  expect(workerStamp).toEqual(expect.any(String));

  // Nothing writes the shim session's own store, so reading the stamp back
  // there is the relayed call reaching the worker's
  expect(shimPopup.workerStampInLocal).toEqual({ status: "read", value: workerStamp });

  expect(contentScript.workerStampInLocal).toEqual({ status: "read", value: workerStamp });

  // And the writes land there too, read back through the worker's own store
  expect(workerPopup.writeSeenByWorker).toEqual({
    status: "read",
    value: workerPopup.contextId,
  });

  expect(shimPopup.writeSeenByWorker).toEqual({ status: "read", value: shimPopup.contextId });

  expect(contentScript.writeSeenByWorker).toEqual({
    status: "read",
    value: contentScript.contextId,
  });
});

test("session storage keeps Chrome's access level across the proxy", async () => {
  const shimPopupId = await openProbeWindow(SHIM_PARTITION, popupUrl("shim-session-storage"));

  const workerPageId = await openProbeWindow(WORKER_PARTITION, `${serverOrigin}/plain`);

  const shimPageId = await openProbeWindow(SHIM_PARTITION, `${serverOrigin}/csp`);

  const shimPopup = await readProbeResults(shimPopupId);

  const workerContentScript = await readProbeResults(workerPageId);

  const shimContentScript = await readProbeResults(shimPageId);

  // An extension page is a trusted context, and reads the worker's stamp
  expect(shimPopup.workerStampInSession.status).toBe("read");

  expect((shimPopup.workerStampInSession as { value: unknown }).value).toEqual(expect.any(String));

  /*
   * A content script is not, and Chrome closes `session` to it by default. The
   * worker session's own content script is refused by Chromium itself, and the
   * shim session's by the relay — which is the point of the check living in
   * main: the call is answered in a privileged context Chromium would allow.
   *
   * Asserting the message rather than the status: `readStorage` also reports
   * "error" for a timeout and for a thrown call, so a status-only assertion
   * could pass without the refusal ever happening. This pins Chromium's own
   * string end to end, on both sides of the proxy.
   */
  expect(workerContentScript.workerStampInSession).toEqual({
    status: "error",
    message: "Access to storage is not allowed from this context.",
  });

  expect(shimContentScript.workerStampInSession).toEqual({
    status: "error",
    message: "Access to storage is not allowed from this context.",
  });
});

/*
 * Skipped because it cannot pass on Electron 43.2.0, and kept because it is the
 * pin that flips when it can. The fan-out has carriage and no source: the
 * relay's listener sits in the extension's service worker, and Electron
 * dispatches no `EventRouter` events into one — measured 2 September 2026 on a
 * bare Electron, with `alarms.onAlarm` and `runtime.onInstalled` just as silent
 * as storage's own events. `runtime.onMessage` does arrive, being messaging
 * rather than an event dispatch, which is why every other test here passes.
 * Unskip it the day that changes; nothing else here should need to.
 */
test.skip("storage.onChanged fires in the shim session, for the worker's writes and its own", async () => {
  /*
   * The flag is what makes a context wait on the change events at all. Every
   * other test's contexts skip the wait, since it is a deadline spent against
   * a source that cannot fire — see `probes.ts`.
   */
  const workerPopupId = await openProbeWindow(
    WORKER_PARTITION,
    popupUrl("worker-changes", { probeStorageChanges: true }),
  );

  const shimPopupId = await openProbeWindow(
    SHIM_PARTITION,
    popupUrl("shim-changes", { probeStorageChanges: true }),
  );

  const pageId = await openProbeWindow(
    SHIM_PARTITION,
    `${serverOrigin}/same?meruProbeStorageChanges=1`,
  );

  const workerPopup = await readProbeResults(workerPopupId);

  const shimPopup = await readProbeResults(shimPopupId);

  const contentScript = await readProbeResults(pageId);

  /*
   * The worker session's own popup is the control: its `onChanged` is
   * Chromium's, firing over the store its own session keeps, and it has to
   * keep working with the proxy in the app. Which of the two events exist is
   * read off it rather than assumed, since the shim may only shadow the ones
   * Electron implements — and the shim session then has to have exactly the
   * same ones.
   */
  const { storageChangeEvents } = workerPopup;

  expect(storageChangeEvents.topLevel).toBe(true);

  expect(shimPopup.storageChangeEvents).toEqual(storageChangeEvents);

  expect(contentScript.storageChangeEvents).toEqual(storageChangeEvents);

  const areaName = "local";

  const newValue = (contextId: string) => (storageChangeEvents.area ? contextId : null);

  expect(workerPopup.workerWriteHeard).toEqual({
    status: "heard",
    newValue: newValue(workerPopup.contextId),
    areaName,
  });

  /*
   * And in the shim session nothing native could have fired these: the store
   * that changed is the worker session's, which this session's own event knows
   * nothing about, so the change came over the parked page stream.
   */
  expect(shimPopup.workerWriteHeard).toEqual({
    status: "heard",
    newValue: newValue(shimPopup.contextId),
    areaName,
  });

  expect(contentScript.workerWriteHeard).toEqual({
    status: "heard",
    newValue: newValue(contentScript.contextId),
    areaName,
  });

  // Chrome fires `onChanged` in the context that made the write too, and a
  // relayed write is no exception: it goes to the worker and comes back here
  // on the same fan-out, with no special case for the context that caused it
  for (const context of [workerPopup, shimPopup, contentScript]) {
    expect(context.ownWriteHeard).toEqual({
      status: "heard",
      newValue: newValue(context.contextId),
      areaName,
    });
  }
});
