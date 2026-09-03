/*
 * The runtime proxy, exercised through the checked-in fixture extension
 * (`packages/electron-extensions/fixture`) — the only automated coverage the
 * shared extension instance has, since 1Password needs a real Google account,
 * the desktop app and a display.
 *
 * The launch carries one extension flag: `MERU_EXTENSIONS_FIXTURE` puts the
 * bundled fixture into every session of this packaged build, and the seed
 * turns the master switch on, extensions being off by default. The shared
 * instance needs no flag, because it is how Meru runs extensions — the default
 * session keeps the fixture's service worker while every account session gets
 * the content-script-only copy whose `chrome.runtime` messaging the proxy
 * relays. Two accounts need Pro, which is why this file launches through
 * `useProApp` — and a file is entirely one entitlement or the other, because
 * `useApp` registers its hooks once at module scope.
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
import { openSettingsPage } from "./lib/settings";

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
 * The one worker runs in Electron's default session, which no account owns, so
 * both accounts are content-script-only however they are ordered — and the
 * second is the one that has to keep working after the first is removed, which
 * is the whole point of the worker living where it does. `null` is how a probe
 * asks for the default session, there being no partition name for it.
 */
const WORKER_SESSION = null;

const REMOVED_PARTITION = "persist:removed-account";

const SURVIVING_PARTITION = "persist:surviving-account";

const meru = useProApp(
  {
    "extensions.enabled": true,
    accounts: [
      account("removed-account", "Removed", true),
      account("surviving-account", "Surviving", false),
    ],
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
  /*
   * A web page embedding a web page of the same origin, which is the shape
   * 1Password's nested-frame handshake runs in: both frames are inside the
   * content script's match pattern, so both get the script, and only the top
   * frame answers what the worker fans out to the tab.
   */
  "/nested":
    "<!doctype html><html><head><meta charset='utf-8'><title>nested</title></head><body><iframe src=\"/nested-child\"></iframe></body></html>",
  "/nested-child":
    "<!doctype html><html><head><meta charset='utf-8'><title>nested child</title></head><body>nested child</body></html>",
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
 * The fixture as one session loaded it, or `null` where it is not loaded at
 * all. `fromPartition` returns the session the app uses for that account,
 * creating an empty one only until the app gets there, and `null` names the
 * default session, where the one worker lives — either way this only reads.
 */
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

/**
 * Waits until the app has loaded the fixture into the session, which happens
 * as the app comes up: the default session before the accounts, and each
 * account's while its `Account` is constructed.
 */
async function waitForFixture(partition: string | null) {
  await expect.poll(async () => (await readLoadedFixture(partition)) !== null).toBe(true);
}

/** Opens a hidden window in the session and resolves to its WebContents id. */
async function openProbeWindow(partition: string | null, url: string) {
  await waitForFixture(partition);

  return meru.app.evaluate(
    async ({ BrowserWindow }, { partition: partitionName, url: probeUrl }) => {
      const probeWindow = new BrowserWindow({
        show: false,
        // Named partitions are the accounts'; without one the window runs in
        // the default session, which is where the one worker is
        webPreferences: partitionName === null ? {} : { partition: partitionName },
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

/**
 * The `WebContents` ids of the views Meru is showing, which is what the
 * embedder answers `tabs.Tab.active` from. Read off the windows rather than
 * from the app's own modules, which a packaged build exposes nothing of.
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

/*
 * The invariant the whole design rests on, read off the copies Chromium
 * actually loaded rather than off anything the extension reports about itself:
 * only the default session carries a `background` key, so no account holds the
 * worker and removing one can never take it away. It comes first in the file
 * because every test below is about a session that has to be shimmed.
 */
test("only the default session holds the worker, and every account is content-script-only", async () => {
  await waitForFixture(WORKER_SESSION);

  await waitForFixture(REMOVED_PARTITION);

  await waitForFixture(SURVIVING_PARTITION);

  const workerFixture = await readLoadedFixture(WORKER_SESSION);

  expect(workerFixture?.manifest.background).toEqual({
    service_worker: "chrome-facade-service-worker.js",
  });

  for (const partition of [REMOVED_PARTITION, SURVIVING_PARTITION]) {
    const accountFixture = await readLoadedFixture(partition);

    expect(accountFixture?.manifest.background).toBeUndefined();

    // The same extension either way, which is what makes the relay able to
    // match the two copies at all
    expect(accountFixture?.id).toBe(FIXTURE_EXTENSION_ID);
  }
});

/*
 * The default session is the app's own, and what Meru puts in it is the main
 * window's renderer and the popups beside it, all one origin. A curated
 * extension cannot reach that origin, its content scripts being clamped to a
 * host allowlist; the fixture is unclamped, so it is the one that would if
 * anything did.
 *
 * What makes it unreachable in a packaged build is the scheme: `loadRenderer`
 * uses `loadFile` outside development, and the loader never asks for file
 * access, so no pattern matches. That is what this asserts. Reading the probe
 * attribute back as `null` would not say it — a context that injected and is
 * still running its probes has not written the attribute yet either — so the
 * absence is held to the scheme rather than to the absence of a result.
 */
test("the main window's renderer is a file:// page no content script can match", async () => {
  await waitForFixture(WORKER_SESSION);

  expect(meru.renderer.url()).toMatch(/^file:/);

  // And nothing has written probe results into it, which is consistent with
  // the above rather than proof of it
  expect(await meru.renderer.locator("html").getAttribute("data-meru-fixture-results")).toBeNull();
});

test("both accounts' popups reach the one worker the default session keeps", async () => {
  const workerPopupId = await openProbeWindow(WORKER_SESSION, popupUrl("worker-popup"));

  const shimPopupId = await openProbeWindow(SURVIVING_PARTITION, popupUrl("shim-popup"));

  const workerPopup = await readProbeResults(workerPopupId);

  const shimPopup = await readProbeResults(shimPopupId);

  // The two sessions load different copies — the default session the whole
  // extension, every account session one derived with no `background` at all —
  // and `getManifest` is where that would otherwise show. The worker session's
  // answer is native and therefore the ground truth; the account session's is
  // the shim's, and the two agreeing is the claim
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
   * The account session's popup has no worker in its own session to answer —
   * its copy carries none — so a reply at all is cross-session relay, and the
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

  const plainPageId = await openProbeWindow(SURVIVING_PARTITION, plainPageUrl);

  const cspPageId = await openProbeWindow(SURVIVING_PARTITION, cspPageUrl);

  const workerPageId = await openProbeWindow(WORKER_SESSION, plainPageUrl);

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

  const pageId = await openProbeWindow(SURVIVING_PARTITION, pageUrl);

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
  const observerPopupId = await openProbeWindow(WORKER_SESSION, popupUrl("navigation-observer"));

  const pageId = await openProbeWindow(SURVIVING_PARTITION, `${serverOrigin}/plain`);

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
  const firstSameId = await openProbeWindow(SURVIVING_PARTITION, samePageUrl);

  const secondSameId = await openProbeWindow(SURVIVING_PARTITION, samePageUrl);

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

  const frameHostId = await openProbeWindow(SURVIVING_PARTITION, frameHostUrl);

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

  /*
   * And the worker's own `chrome.webNavigation.getFrame` for that frame, which
   * is the shape a fill runs in: an extension iframe inside a web page, in a
   * session the worker's own holds no tab of. 1Password relays the inline-menu
   * click to the frame owning the form only once this has named that frame's
   * parent, so a `null` here is a click that does nothing.
   */
  expect(embeddedFrame.senderFrameSeenByWorker).toEqual({
    status: "replied",
    reply: expect.objectContaining({
      frameId: embeddedFrameSender.frameId,
      parentFrameId: 0,
      url: embeddedFrameUrl,
    }),
  });

  // The host document's own frame query, answered for the same cross-session
  // tab: the main frame, which is frame 0 and has no parent
  const frameHost = await readProbeResults(frameHostId);

  expect(frameHost.senderFrameSeenByWorker).toEqual({
    status: "replied",
    reply: expect.objectContaining({ frameId: 0, parentFrameId: -1, url: frameHostUrl }),
  });
});

/*
 * The relay shape 1Password's `get-nested-frame-configuration` and
 * `remove-inline-button` requests have, and the one nothing else here covered:
 * the asking context is a subframe, the worker's `tabs.sendMessage` names no
 * frame, the asking frame's own listener declines, and the answer has to come
 * from the top frame. Every other worker-to-tab test either names a `frameId`
 * or runs on a page with one frame.
 *
 * When every frame declines, the tab's message port closes rather than
 * replying, and 1Password reads that as a missing receiving end — the same
 * value Chrome gives it. So the assertion worth making is not that the call
 * came back at all but that what came back is the *top* frame's answer.
 */
test("a subframe's relayed message to its own tab is answered by the top frame", async () => {
  const nestedUrl = `${serverOrigin}/nested`;

  const nestedId = await openProbeWindow(SURVIVING_PARTITION, nestedUrl);

  const subframe = await readProbeResults(nestedId, `${serverOrigin}/nested-child`);

  const top = await readProbeResults(nestedId);

  /*
   * The reply carries the top frame's own `contextId`, which is the whole
   * claim: the subframe asked, the worker sent into the tab without naming a
   * frame, and the frame that answered is not the one that asked.
   */
  expect(subframe.askedTab.outcome).toEqual({
    status: "replied",
    reply: {
      type: "top-answered",
      nonce: `ask-tab:${subframe.contextId}`,
      contextId: top.contextId,
    },
  });

  // And the subframe heard the message it declined, so the fan-out reached
  // both frames rather than the top frame alone
  expect(subframe.askedTab.heard).toEqual({
    type: "answer-if-top",
    nonce: `ask-tab:${subframe.contextId}`,
    workerInstanceId: expect.any(String),
  });

  // The top frame's own turn at the same call, which it answers itself
  expect(top.askedTab.outcome).toEqual({
    status: "replied",
    reply: { type: "top-answered", nonce: `ask-tab:${top.contextId}`, contextId: top.contextId },
  });
});

test("the worker reaches a shimmed content script it never heard from first", async () => {
  const pageUrl = `${serverOrigin}/plain`;

  const pageId = await openProbeWindow(SURVIVING_PARTITION, pageUrl);

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

/*
 * What the lock-state broadcast rests on. 1Password tells content scripts the
 * vault locked by asking `tabs.query` for the tabs and then messaging each of
 * them, and natively the worker's query lists the tabs of its own session
 * alone — none of which is an account's.
 */
test("the worker's tabs.query lists a tab of a session it shims, and tabs.get answers it", async () => {
  const pageUrl = `${serverOrigin}/plain`;

  const pageId = await openProbeWindow(SURVIVING_PARTITION, pageUrl);

  const page = await readProbeResults(pageId);

  expect(page.tabsSeenByWorker.tabs).toContainEqual({
    id: pageId,
    url: pageUrl,
    active: expect.any(Boolean),
  });

  // And by id, which is what a worker holding a tab id from a sender does next
  expect(page.tabsSeenByWorker.self).toEqual({
    status: "replied",
    reply: { id: pageId, url: pageUrl },
  });

  /*
   * `active` is the embedder's answer rather than Electron's focus: a hidden
   * window is never the tab a window is showing, and the view Meru has in
   * front is, whether or not anything is focused — which matters because
   * 1Password unlocks behind a Touch ID prompt that takes the focus away.
   */
  expect(page.tabsSeenByWorker.activeTabIds).not.toContain(pageId);

  const [activeTabId, ...alsoActive] = page.tabsSeenByWorker.activeTabIds;

  // One tab is in front, and it is one of the views the window is showing.
  // Which of them is the selected account's is Meru's own business, and not
  // something a packaged build exposes to read back here
  expect(alsoActive).toEqual([]);

  expect(await readVisibleViewIds()).toContain(activeTabId);
});

test("a lock-state-shaped broadcast reaches a shimmed content script", async () => {
  const pageId = await openProbeWindow(SURVIVING_PARTITION, `${serverOrigin}/plain`);

  const page = await readProbeResults(pageId);

  // The whole shape, run by the worker: `tabs.query` for every tab, then one
  // `tabs.sendMessage` into each. A query that listed nothing reports itself
  // here as the worker never finding this context's tab to send to
  expect(page.workerNotifiedAllTabs.heard).toEqual({
    type: "ping-from-worker",
    nonce: `notify-all-tabs:${page.contextId}`,
    workerInstanceId: expect.any(String),
  });

  expect(page.workerNotifiedAllTabs.outcome).toEqual({
    status: "replied",
    reply: {
      type: "pong",
      nonce: `notify-all-tabs:${page.contextId}`,
      contextId: page.contextId,
    },
  });
});

test("an action popup is no tab, and the worker says so rather than guessing", async () => {
  const shimPopupId = await openProbeWindow(SURVIVING_PARTITION, popupUrl("shim-popup-no-tab"));

  const shimPopup = await readProbeResults(shimPopupId);

  // Chrome gives an action popup's messages no `sender.tab`, so there is no
  // tab id for the worker to send back into — which the worker reports rather
  // than sending into whatever tab happens to be in front
  expect(shimPopup.workerSentBack.heard).toBeNull();

  expect(shimPopup.workerSentBack.outcome).toEqual({
    status: "error",
    message: "The sender carried no tab",
  });

  // And no tab to ask a frame query about either
  expect(shimPopup.senderFrameSeenByWorker).toEqual({
    status: "error",
    message: "The sender carried no tab",
  });
});

test("storage is one store: the shim session's contexts read and write the worker's", async () => {
  const workerPopupId = await openProbeWindow(WORKER_SESSION, popupUrl("worker-storage"));

  const shimPopupId = await openProbeWindow(SURVIVING_PARTITION, popupUrl("shim-storage"));

  const pageId = await openProbeWindow(SURVIVING_PARTITION, `${serverOrigin}/same`);

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
  const shimPopupId = await openProbeWindow(SURVIVING_PARTITION, popupUrl("shim-session-storage"));

  const workerPageId = await openProbeWindow(WORKER_SESSION, `${serverOrigin}/plain`);

  const shimPageId = await openProbeWindow(SURVIVING_PARTITION, `${serverOrigin}/csp`);

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
    WORKER_SESSION,
    popupUrl("worker-changes", { probeStorageChanges: true }),
  );

  const shimPopupId = await openProbeWindow(
    SURVIVING_PARTITION,
    popupUrl("shim-changes", { probeStorageChanges: true }),
  );

  const pageId = await openProbeWindow(
    SURVIVING_PARTITION,
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

/*
 * What the worker living in the default session buys, and the reason for the
 * whole change: removing an account is a non-event for every other account.
 * Nothing about the removed session was load-bearing — it held a
 * content-script-only copy like all the others — so the worker keeps running,
 * the one 1Password sign-in it stands in for survives, and the accounts left
 * behind go on reaching it.
 *
 * Last in the file, because it removes an account the tests above open windows
 * in.
 */
test("removing an account leaves the one worker, and its store, where it was", async () => {
  await waitForFixture(WORKER_SESSION);

  await waitForFixture(REMOVED_PARTITION);

  await waitForFixture(SURVIVING_PARTITION);

  /*
   * The worker instance the surviving account reaches before the removal. The
   * id is what tells a surviving worker from a new one: a worker that restarted
   * would answer with an id of its own, and a session that adopted the role
   * afterwards would have started signed out.
   */
  const beforePopupId = await openProbeWindow(SURVIVING_PARTITION, popupUrl("before-removal"));

  const beforePopup = await readProbeResults(beforePopupId);

  expect(beforePopup.echo.status).toBe("replied");

  const { workerInstanceId } = (beforePopup.echo as { reply: { workerInstanceId: string } }).reply;

  expect(workerInstanceId).toEqual(expect.any(String));

  expect(beforePopup.workerStampInLocal.status).toBe("read");

  const workerStamp = (beforePopup.workerStampInLocal as { value: unknown }).value;

  expect(workerStamp).toEqual(expect.any(String));

  const navigation = await meru.openSettings();

  await openSettingsPage(meru, navigation, "Accounts");

  // The first row is the account the partition constants name as the removed
  // one: accounts are listed in config order
  await meru.renderer.getByRole("button", { name: "Remove account" }).first().click();

  await meru.renderer
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove account" })
    .click();

  await expect.poll(async () => (await readLoadedFixture(REMOVED_PARTITION)) === null).toBe(true);

  /*
   * A context opened after the removal, rather than the one from before: what
   * has to work is the whole path from a new document through the relay to the
   * worker, which is what a password manager needs the next time a page asks
   * it to fill something.
   */
  const afterPopupId = await openProbeWindow(SURVIVING_PARTITION, popupUrl("after-removal"));

  const afterPopup = await readProbeResults(afterPopupId);

  // The same worker instance, so nothing restarted and nothing was adopted
  expect(afterPopup.echo).toEqual(
    echoReply(afterPopup, workerInstanceId, {
      url: popupUrl("after-removal"),
      origin: `chrome-extension://${FIXTURE_EXTENSION_ID}`,
      frameId: null,
      hasTab: false,
      tabId: null,
      tabUrl: null,
    }),
  );

  // And the one store is the one it was, which is what the sign-in lives in
  expect(afterPopup.workerStampInLocal).toEqual({ status: "read", value: workerStamp });

  expect(afterPopup.writeSeenByWorker).toEqual({
    status: "read",
    value: afterPopup.contextId,
  });

  // A content script of the surviving account too, the other side of the shim
  const pageId = await openProbeWindow(SURVIVING_PARTITION, `${serverOrigin}/plain`);

  const page = await readProbeResults(pageId);

  expect(page.echo.status).toBe("replied");

  expect(page.workerStampInLocal).toEqual({ status: "read", value: workerStamp });
});
