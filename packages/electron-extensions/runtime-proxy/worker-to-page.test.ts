import { describe, expect, test } from "bun:test";
import type {
  OnBeforeSendHeadersListenerDetails,
  Session,
  WebContents,
  WebFrameMain,
} from "electron";
import { ExtensionBridge } from "../bridge/bridge";
import { getExtensionBridgeUrl } from "../bridge/protocol";
import { NativeMessageDecoder } from "../native-messaging/framing";
import {
  noFrameError,
  noTabError,
  RECEIVING_END_ERROR,
  type RuntimeProxyJob,
  type RuntimeProxyPageEnvelope,
  RUNTIME_PROXY_PATHS,
} from "./bridge-protocol";
import { RuntimeProxy, type RuntimeProxyOptions } from "./runtime-proxy";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const WORKER_TOKEN = "worker-token";

const SHIM_TOKEN = "shim-token";

const PAGE_URL = "https://accounts.google.com/signin";

const FORM_FRAME_URL = "https://accounts.google.com/signin/form";

const INLINE_MENU_URL = `chrome-extension://${EXTENSION_ID}/inline-menu.html`;

/** The `WebContents` id of the shimmed session's tab, which is its tab id. */
const SHIM_TAB_ID = 7;

const WORKER_TAB_ID = 9;

async function waitFor(condition: () => boolean, what: string) {
  const deadline = Date.now() + 1000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

type BeforeSendHeadersListener = (
  details: OnBeforeSendHeadersListenerDetails,
  callback: (response: { requestHeaders?: Record<string, string> }) => void,
) => void;

function createFakeSession() {
  let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

  let beforeSendHeadersListener: BeforeSendHeadersListener | null = null;

  const session = {
    protocol: {
      handle: (_scheme: string, handler: (request: GlobalRequest) => Promise<Response>) => {
        requestHandler = handler;
      },
      unhandle: () => {
        requestHandler = undefined;
      },
    },
    webRequest: {
      onBeforeSendHeaders: (
        filterOrListener: unknown,
        maybeListener?: BeforeSendHeadersListener | null,
      ) => {
        beforeSendHeadersListener =
          maybeListener === undefined
            ? (filterOrListener as BeforeSendHeadersListener | null)
            : maybeListener;
      },
    },
    serviceWorkers: {
      on: () => undefined,
      removeListener: () => undefined,
    },
  } as unknown as Session;

  return {
    session,
    /** Sends a request the way Electron carries one, caller stamp and all. */
    request: (
      pathName: string,
      bridgeToken: string,
      body: Record<string, unknown>,
      callerFrame?: WebFrameMain,
    ) => {
      const url = getExtensionBridgeUrl(pathName, bridgeToken);

      let requestHeaders: Record<string, string> = {};

      beforeSendHeadersListener?.(
        { url, frame: callerFrame ?? null, requestHeaders } as OnBeforeSendHeadersListenerDetails,
        ({ requestHeaders: stampedHeaders }) => {
          if (stampedHeaders) {
            requestHeaders = stampedHeaders;
          }
        },
      );

      return requestHandler?.(
        new Request(url, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify(body),
        }) as GlobalRequest,
      ) as Promise<Response>;
    },
  };
}

type FakeFrame = WebFrameMain & { destroy: () => void; navigate: (url: string) => void };

function createFrame(url: string, parent: WebFrameMain | null, frameTreeNodeId: number) {
  let isDestroyed = false;

  let frameUrl = url;

  return {
    get url() {
      return frameUrl;
    },
    parent,
    frameTreeNodeId,
    isDestroyed: () => isDestroyed,
    destroy: () => {
      isDestroyed = true;
    },
    /** A new document in the same frame, which parks a stream of its own. */
    navigate: (nextUrl: string) => {
      frameUrl = nextUrl;
    },
  } as unknown as FakeFrame;
}

/** A tab of one session: a main frame, a subframe, and the contents holding both. */
function createTab(session: Session, contentsId: number, url: string) {
  const mainFrame = createFrame(url, null, 1);

  const subFrame = createFrame(FORM_FRAME_URL, mainFrame, 12);

  const inlineMenuFrame = createFrame(INLINE_MENU_URL, mainFrame, 13);

  const contents = {
    id: contentsId,
    session,
    isDestroyed: () => false,
    getURL: () => url,
    getTitle: () => "Sign in",
    isLoading: () => false,
    isCurrentlyAudible: () => false,
    isAudioMuted: () => false,
    mainFrame: {
      ...mainFrame,
      framesInSubtree: [mainFrame, subFrame, inlineMenuFrame],
    },
  } as unknown as WebContents;

  return { mainFrame, subFrame, inlineMenuFrame, contents };
}

function createHarness(proxyOptions: RuntimeProxyOptions = {}) {
  const workerSession = createFakeSession();

  const shimSession = createFakeSession();

  const bridge = new ExtensionBridge();

  bridge.setupSession(workerSession.session, {
    getExtensionId: (bridgeToken) => (bridgeToken === WORKER_TOKEN ? EXTENSION_ID : undefined),
  });

  bridge.setupSession(shimSession.session, {
    getExtensionId: (bridgeToken) => (bridgeToken === SHIM_TOKEN ? EXTENSION_ID : undefined),
  });

  const shimTab = createTab(shimSession.session, SHIM_TAB_ID, PAGE_URL);

  const workerTab = createTab(workerSession.session, WORKER_TAB_ID, PAGE_URL);

  const popupFrame = createFrame(`chrome-extension://${EXTENSION_ID}/popup.html`, null, 1);

  const popupContents = {
    id: 11,
    session: shimSession.session,
    isDestroyed: () => false,
    getURL: () => `chrome-extension://${EXTENSION_ID}/popup.html`,
    getTitle: () => "1Password",
    isLoading: () => false,
    isCurrentlyAudible: () => false,
    isAudioMuted: () => false,
    mainFrame: { ...popupFrame, framesInSubtree: [popupFrame] },
  } as unknown as WebContents;

  const contentsByFrame = new Map<WebFrameMain, WebContents>([
    [shimTab.mainFrame, shimTab.contents],
    [shimTab.subFrame, shimTab.contents],
    [shimTab.inlineMenuFrame, shimTab.contents],
    [workerTab.mainFrame, workerTab.contents],
    [popupFrame, popupContents],
  ]);

  const contentsById = new Map<number, WebContents>([
    [SHIM_TAB_ID, shimTab.contents],
    [WORKER_TAB_ID, workerTab.contents],
    [11, popupContents],
  ]);

  const proxy = new RuntimeProxy({
    getWebContentsFromFrame: (frame) => contentsByFrame.get(frame),
    getWebContentsById: (tabId) => contentsById.get(tabId),
    waitForContextMs: 50,
    ...proxyOptions,
  });

  proxy.registerRoutes(bridge);

  proxy.setWorkerSession(workerSession.session);

  /** Parks a page stream the way a shimmed context's client does. */
  const parkPageStream = async (frame: WebFrameMain) => {
    const response = await shimSession.request(
      RUNTIME_PROXY_PATHS.pageStream,
      SHIM_TOKEN,
      { sender: { url: frame.url, isTopFrame: frame.parent === null } },
      frame,
    );

    expect(response.status).toBe(200);

    const envelopes: RuntimeProxyPageEnvelope[] = [];

    let isEnded = false;

    // The relay names the context on the stream before anything else, which is
    // what a client sends back when it says which end of a port hung up
    let contextId: string | undefined;

    const reader = response.body?.getReader();

    void (async () => {
      const decoder = new NativeMessageDecoder();

      for (;;) {
        const result = await reader?.read();

        if (!result || result.done) {
          isEnded = true;

          return;
        }

        for (const envelope of decoder.push(result.value) as RuntimeProxyPageEnvelope[]) {
          if (envelope.kind === "ready") {
            contextId = envelope.contextId;

            continue;
          }

          envelopes.push(envelope);
        }
      }
    })();

    return {
      envelopes,
      isEnded: () => isEnded,
      contextId: () => contextId,
      waitForEnvelopes: async (envelopeCount: number) => {
        await waitFor(() => envelopes.length >= envelopeCount, `${envelopeCount} envelopes`);

        return envelopes;
      },
      /** Answers a delivery the way the page-stream client answers one. */
      reply: (deliveryId: string, result: Record<string, unknown>) =>
        shimSession.request(
          RUNTIME_PROXY_PATHS.pageReply,
          SHIM_TOKEN,
          { deliveryId, result },
          frame,
        ),
      /** Hangs up one end of a port, naming this context as the client does. */
      disconnectPort: (portId: string, reason?: "noListener") =>
        shimSession.request(
          RUNTIME_PROXY_PATHS.portDisconnect,
          SHIM_TOKEN,
          { portId, contextId, reason },
          frame,
        ),
    };
  };

  /** Parks the worker's job stream, collecting what the relay hands it. */
  const openWorkerStream = async () => {
    const response = await workerSession.request(RUNTIME_PROXY_PATHS.workerJobs, WORKER_TOKEN, {});

    const jobs: RuntimeProxyJob[] = [];

    const reader = response.body?.getReader();

    void (async () => {
      const decoder = new NativeMessageDecoder();

      for (;;) {
        const result = await reader?.read();

        if (!result || result.done) {
          return;
        }

        for (const job of decoder.push(result.value) as RuntimeProxyJob[]) {
          jobs.push(job);
        }
      }
    })();

    return {
      jobs,
      waitForJobs: async (jobCount: number) => {
        await waitFor(() => jobs.length >= jobCount, `${jobCount} jobs`);

        return jobs;
      },
    };
  };

  const sendToTab = async (body: Record<string, unknown>) => {
    const response = await workerSession.request(
      RUNTIME_PROXY_PATHS.workerSendToTab,
      WORKER_TOKEN,
      body,
    );

    return (await response.json()) as Record<string, unknown>;
  };

  const broadcast = async (message: unknown) => {
    const response = await workerSession.request(
      RUNTIME_PROXY_PATHS.workerBroadcast,
      WORKER_TOKEN,
      {
        message,
      },
    );

    return (await response.json()) as Record<string, unknown>;
  };

  /** Reports a change of the worker's store, as the relay client does. */
  const reportStorageChange = (body: Record<string, unknown>) =>
    workerSession.request(RUNTIME_PROXY_PATHS.workerStorageChanged, WORKER_TOKEN, body);

  /** And the access level, which is the other record the fan-out is held to. */
  const reportAccessLevel = (body: Record<string, unknown>) =>
    workerSession.request(RUNTIME_PROXY_PATHS.workerStorageAccessLevel, WORKER_TOKEN, body);

  const connectToTab = async (body: Record<string, unknown>) => {
    const response = await workerSession.request(
      RUNTIME_PROXY_PATHS.workerConnectToTab,
      WORKER_TOKEN,
      body,
    );

    return (await response.json()) as Record<string, unknown>;
  };

  return {
    proxy,
    bridge,
    workerSession,
    shimSession,
    shimTab,
    workerTab,
    popupFrame,
    parkPageStream,
    openWorkerStream,
    sendToTab,
    broadcast,
    connectToTab,
    reportStorageChange,
    reportAccessLevel,
  };
}

describe("a page stream", () => {
  test("is refused when the caller frame does not back the report", async () => {
    const { shimSession, shimTab } = createHarness();

    const response = await shimSession.request(
      RUNTIME_PROXY_PATHS.pageStream,
      SHIM_TOKEN,
      // The frame is at the page's URL, not the one the report claims
      { sender: { url: "https://evil.example/", isTopFrame: true } },
      shimTab.mainFrame,
    );

    expect(response.status).toBe(400);
  });

  test("is refused from the worker's own session, which needs no relay", async () => {
    const { workerSession, workerTab } = createHarness();

    const response = await workerSession.request(
      RUNTIME_PROXY_PATHS.pageStream,
      WORKER_TOKEN,
      { sender: { url: PAGE_URL, isTopFrame: true } },
      workerTab.mainFrame,
    );

    expect(response.status).toBe(403);
  });

  test("a fresh document in the frame replaces the context the old one had", async () => {
    const { shimTab, parkPageStream, sendToTab } = createHarness();

    const firstStream = await parkPageStream(shimTab.mainFrame);

    shimTab.mainFrame.navigate(`${PAGE_URL}/next`);

    const secondStream = await parkPageStream(shimTab.mainFrame);

    await waitFor(() => firstStream.isEnded(), "the replaced stream to end");

    const delivered = sendToTab({ tabId: SHIM_TAB_ID, message: "hello" });

    const [envelope] = await secondStream.waitForEnvelopes(1);

    expect(envelope?.kind).toBe("message");
    expect(firstStream.envelopes).toEqual([]);

    if (envelope?.kind === "message") {
      await secondStream.reply(envelope.deliveryId, { status: "replied", reply: "hi" });
    }

    expect(await delivered).toEqual({ status: "replied", reply: "hi" });
  });

  test("a second park of the same document keeps both rather than thrashing", async () => {
    const { shimTab, parkPageStream } = createHarness();

    const firstStream = await parkPageStream(shimTab.mainFrame);

    const secondStream = await parkPageStream(shimTab.mainFrame);

    // The shim installs once per context however many content_scripts entries
    // ran it, so this cannot happen; if it ever did, the cost is one message
    // delivered twice to a frame rather than two streams evicting each other
    // for the life of the page — see `install-shim.ts`
    expect(firstStream.isEnded()).toBe(false);
    expect(secondStream.isEnded()).toBe(false);
  });
});

describe("tabs.sendMessage from the worker", () => {
  test("reaches the tab's shimmed context and carries its reply back", async () => {
    const { shimTab, parkPageStream, sendToTab } = createHarness();

    const stream = await parkPageStream(shimTab.mainFrame);

    const delivered = sendToTab({ tabId: SHIM_TAB_ID, message: { kind: "fill" } });

    const [envelope] = await stream.waitForEnvelopes(1);

    expect(envelope).toMatchObject({
      kind: "message",
      message: { kind: "fill" },
      // The extension itself, which is what Chrome hands a content script
      sender: {
        id: EXTENSION_ID,
        origin: `chrome-extension://${EXTENSION_ID}`,
        documentLifecycle: "active",
      },
    });

    if (envelope?.kind === "message") {
      await stream.reply(envelope.deliveryId, { status: "replied", reply: { filled: true } });
    }

    expect(await delivered).toEqual({ status: "replied", reply: { filled: true } });
  });

  test("a tab of the worker's own session is the worker's to send to natively", async () => {
    const { sendToTab } = createHarness();

    expect(await sendToTab({ tabId: WORKER_TAB_ID, message: "hello" })).toEqual({
      status: "ownSession",
    });
  });

  test("a tab that does not exist answers with Chrome's own error", async () => {
    const { sendToTab } = createHarness();

    expect(await sendToTab({ tabId: 404, message: "hello" })).toEqual({
      status: "noTarget",
      error: noTabError(404),
    });
  });

  test("a frame the tab does not have answers with Chrome's own error", async () => {
    const { sendToTab } = createHarness();

    expect(await sendToTab({ tabId: SHIM_TAB_ID, frameId: 99, message: "hello" })).toEqual({
      status: "noTarget",
      error: noFrameError(99, SHIM_TAB_ID),
    });
  });

  test("a document id matches nothing, there being none to match", async () => {
    const { shimTab, parkPageStream, sendToTab } = createHarness();

    await parkPageStream(shimTab.mainFrame);

    const result = await sendToTab({
      tabId: SHIM_TAB_ID,
      documentId: "d1",
      message: "hello",
    });

    expect(result.status).toBe("noTarget");
  });

  test("a tab with nothing of the extension listening has no receiving end", async () => {
    const { sendToTab } = createHarness();

    expect(await sendToTab({ tabId: SHIM_TAB_ID, message: "hello" })).toEqual({
      status: "noListener",
    });
  });

  test("waits a bounded moment for a context that has not parked yet", async () => {
    const { shimTab, parkPageStream, sendToTab } = createHarness();

    const delivered = sendToTab({ tabId: SHIM_TAB_ID, message: "early" });

    const stream = await parkPageStream(shimTab.mainFrame);

    const [envelope] = await stream.waitForEnvelopes(1);

    if (envelope?.kind === "message") {
      await stream.reply(envelope.deliveryId, { status: "replied", reply: "late but there" });
    }

    expect(await delivered).toEqual({ status: "replied", reply: "late but there" });
  });

  test("goes to every frame of the tab, and the first answer wins", async () => {
    const { shimTab, parkPageStream, sendToTab } = createHarness();

    const mainStream = await parkPageStream(shimTab.mainFrame);

    const formStream = await parkPageStream(shimTab.subFrame);

    const delivered = sendToTab({ tabId: SHIM_TAB_ID, message: "which of you" });

    const [mainEnvelope] = await mainStream.waitForEnvelopes(1);

    const [formEnvelope] = await formStream.waitForEnvelopes(1);

    // The frame with the form answers; the other has no listener for it
    if (mainEnvelope?.kind === "message") {
      await mainStream.reply(mainEnvelope.deliveryId, { status: "noListener" });
    }

    if (formEnvelope?.kind === "message") {
      await formStream.reply(formEnvelope.deliveryId, { status: "replied", reply: "the form" });
    }

    expect(await delivered).toEqual({ status: "replied", reply: "the form" });
  });

  test("a frame that took the message and never answered closes the message port", async () => {
    const { shimTab, parkPageStream, sendToTab } = createHarness();

    const mainStream = await parkPageStream(shimTab.mainFrame);

    const formStream = await parkPageStream(shimTab.subFrame);

    const delivered = sendToTab({ tabId: SHIM_TAB_ID, message: "anyone" });

    const [mainEnvelope] = await mainStream.waitForEnvelopes(1);

    const [formEnvelope] = await formStream.waitForEnvelopes(1);

    if (mainEnvelope?.kind === "message") {
      await mainStream.reply(mainEnvelope.deliveryId, { status: "noListener" });
    }

    if (formEnvelope?.kind === "message") {
      await formStream.reply(formEnvelope.deliveryId, { status: "closed" });
    }

    expect(await delivered).toEqual({ status: "closed" });
  });

  test("only the named frame hears a message addressed to one", async () => {
    const { shimTab, parkPageStream, sendToTab } = createHarness();

    const mainStream = await parkPageStream(shimTab.mainFrame);

    const formStream = await parkPageStream(shimTab.subFrame);

    const delivered = sendToTab({ tabId: SHIM_TAB_ID, frameId: 12, message: "the form only" });

    const [formEnvelope] = await formStream.waitForEnvelopes(1);

    if (formEnvelope?.kind === "message") {
      await formStream.reply(formEnvelope.deliveryId, { status: "replied", reply: "filled" });
    }

    expect(await delivered).toEqual({ status: "replied", reply: "filled" });
    expect(mainStream.envelopes).toEqual([]);
  });

  test("a context whose frame is gone is never delivered into", async () => {
    const { shimTab, parkPageStream, sendToTab } = createHarness();

    const stream = await parkPageStream(shimTab.mainFrame);

    shimTab.mainFrame.destroy();

    expect(await sendToTab({ tabId: SHIM_TAB_ID, message: "anyone there" })).toEqual({
      status: "noListener",
    });

    expect(stream.envelopes).toEqual([]);
  });
});

describe("a runtime.sendMessage broadcast from the worker", () => {
  test("reaches the extension's own pages and not the content scripts", async () => {
    const { shimTab, popupFrame, parkPageStream, broadcast } = createHarness();

    const contentScriptStream = await parkPageStream(shimTab.mainFrame);

    const inlineMenuStream = await parkPageStream(shimTab.inlineMenuFrame);

    const popupStream = await parkPageStream(popupFrame);

    const delivered = broadcast({ kind: "locked" });

    const [inlineMenuEnvelope] = await inlineMenuStream.waitForEnvelopes(1);

    await popupStream.waitForEnvelopes(1);

    // A content script hears a runtime broadcast in no browser, Chrome
    // included; `tabs.sendMessage` is what reaches one
    expect(contentScriptStream.envelopes).toEqual([]);

    if (inlineMenuEnvelope?.kind === "message") {
      await inlineMenuStream.reply(inlineMenuEnvelope.deliveryId, {
        status: "replied",
        reply: "menu closed",
      });
    }

    expect(await delivered).toEqual({ status: "replied", reply: "menu closed" });
  });

  test("with no extension page anywhere there is no receiving end", async () => {
    const { shimTab, parkPageStream, broadcast } = createHarness();

    await parkPageStream(shimTab.mainFrame);

    expect(await broadcast("anyone")).toEqual({ status: "noListener" });
  });
});

describe("tabs.connect from the worker", () => {
  test("opens a port the page posts back on, and closes it when the page hangs up", async () => {
    const { shimTab, shimSession, workerSession, parkPageStream, openWorkerStream, connectToTab } =
      createHarness();

    const workerStream = await openWorkerStream();

    const stream = await parkPageStream(shimTab.subFrame);

    expect(await connectToTab({ portId: "port-1", name: "fill", tabId: SHIM_TAB_ID })).toEqual({
      status: "connected",
    });

    const [connectEnvelope] = await stream.waitForEnvelopes(1);

    expect(connectEnvelope).toMatchObject({ kind: "connect", portId: "port-1", name: "fill" });

    // The worker posts, which reaches the bound context as a port frame
    await workerSession.request(RUNTIME_PROXY_PATHS.workerPortPost, WORKER_TOKEN, {
      portId: "port-1",
      message: "marco",
    });

    const [, portMessage] = await stream.waitForEnvelopes(2);

    expect(portMessage).toMatchObject({ kind: "portMessage", message: "marco" });

    // And the page posts, which reaches the worker as a job
    await shimSession.request(
      RUNTIME_PROXY_PATHS.portPost,
      SHIM_TOKEN,
      { portId: "port-1", message: "polo" },
      shimTab.subFrame,
    );

    const jobs = await workerStream.waitForJobs(1);

    expect(jobs[0]).toMatchObject({ type: "portMessage", portId: "port-1", message: "polo" });

    await stream.disconnectPort("port-1");

    const jobsAfterDisconnect = await workerStream.waitForJobs(2);

    expect(jobsAfterDisconnect[1]).toMatchObject({ type: "portDisconnect", portId: "port-1" });
  });

  test("a tab with no shimmed context has no receiving end", async () => {
    const { connectToTab } = createHarness();

    expect(await connectToTab({ portId: "port-2", tabId: SHIM_TAB_ID })).toEqual({
      status: "noListener",
    });
  });

  test("a tab of the worker's own session is the worker's to connect to natively", async () => {
    const { connectToTab } = createHarness();

    expect(await connectToTab({ portId: "port-3", tabId: WORKER_TAB_ID })).toEqual({
      status: "ownSession",
    });
  });

  test("a frame with nothing listening hangs up with Chrome's missing receiving end", async () => {
    const { shimTab, parkPageStream, openWorkerStream, connectToTab } = createHarness();

    const workerStream = await openWorkerStream();

    const stream = await parkPageStream(shimTab.subFrame);

    await connectToTab({ portId: "port-5", tabId: SHIM_TAB_ID, frameId: 12 });

    await stream.waitForEnvelopes(1);

    // What the page-stream client posts when the connect reached a context
    // that has no `onConnect` listener — the ordinary case for a content
    // script still loading, which the worker must not read as a clean hang-up
    await stream.disconnectPort("port-5", "noListener");

    const jobs = await workerStream.waitForJobs(1);

    expect(jobs[0]).toMatchObject({
      type: "portDisconnect",
      portId: "port-5",
      error: RECEIVING_END_ERROR,
    });
  });

  test("a port bound to two frames outlives the first of them hanging up", async () => {
    const { shimTab, workerSession, parkPageStream, openWorkerStream, connectToTab } =
      createHarness();

    const workerStream = await openWorkerStream();

    const mainStream = await parkPageStream(shimTab.mainFrame);

    const formStream = await parkPageStream(shimTab.subFrame);

    await connectToTab({ portId: "port-4", tabId: SHIM_TAB_ID });

    await mainStream.waitForEnvelopes(1);

    await formStream.waitForEnvelopes(1);

    await mainStream.disconnectPort("port-4");

    // Still open for the frame that has not hung up
    await workerSession.request(RUNTIME_PROXY_PATHS.workerPortPost, WORKER_TOKEN, {
      portId: "port-4",
      message: "still there?",
    });

    const [, formPortMessage] = await formStream.waitForEnvelopes(2);

    expect(formPortMessage).toMatchObject({ kind: "portMessage", message: "still there?" });
    expect(mainStream.envelopes).toHaveLength(1);

    await formStream.disconnectPort("port-4");

    const jobs = await workerStream.waitForJobs(1);

    expect(jobs[0]).toMatchObject({ type: "portDisconnect", portId: "port-4" });
  });
});

/**
 * The `chrome.storage.onChanged` fan-out, which rides the same page streams as
 * everything else the worker starts and is the only thing that fires those
 * events in a shimmed session: the session's own store is what its native
 * event watches, and nothing writes that any more.
 *
 * Unlike a message it is addressed to every context of the extension rather
 * than to a tab or to the extension's pages, and unlike a message it is
 * answered by nobody — there is no delivery to settle and no receiving end to
 * be missing.
 */
describe("a storage change from the worker", () => {
  const CHANGES = { unlocked: { oldValue: false, newValue: true } };

  test("reaches every parked context, content scripts and extension pages alike", async () => {
    const harness = createHarness();

    const contentScript = await harness.parkPageStream(harness.shimTab.mainFrame);

    const inlineMenu = await harness.parkPageStream(harness.shimTab.inlineMenuFrame);

    const popup = await harness.parkPageStream(harness.popupFrame);

    const response = await harness.reportStorageChange({
      area: "local",
      changes: CHANGES,
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });

    expect(response.status).toBe(204);

    const envelope: RuntimeProxyPageEnvelope = {
      kind: "storageChanged",
      area: "local",
      changes: CHANGES,
    };

    expect(await contentScript.waitForEnvelopes(1)).toEqual([envelope]);

    expect(await inlineMenu.waitForEnvelopes(1)).toEqual([envelope]);

    expect(await popup.waitForEnvelopes(1)).toEqual([envelope]);
  });

  test("is withheld from content scripts while the worker says the area is closed", async () => {
    const harness = createHarness();

    const contentScript = await harness.parkPageStream(harness.shimTab.mainFrame);

    const popup = await harness.parkPageStream(harness.popupFrame);

    await harness.reportStorageChange({
      area: "session",
      changes: CHANGES,
      accessLevel: "TRUSTED_CONTEXTS",
    });

    // The extension's own documents are trusted contexts, which Chrome tells
    // about a closed area's changes exactly as it lets them read it
    expect(await popup.waitForEnvelopes(1)).toEqual([
      {
        kind: "storageChanged",
        area: "session",
        changes: CHANGES,
      } satisfies RuntimeProxyPageEnvelope,
    ]);

    // And the content script hears nothing, since hearing what changed in an
    // area is reading it. Proven by a second change it may hear arriving after
    await harness.reportStorageChange({
      area: "local",
      changes: CHANGES,
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });

    expect(await contentScript.waitForEnvelopes(1)).toEqual([
      {
        kind: "storageChanged",
        area: "local",
        changes: CHANGES,
      } satisfies RuntimeProxyPageEnvelope,
    ]);
  });

  test("is withheld from content scripts while main's own record says closed", async () => {
    const harness = createHarness();

    const contentScript = await harness.parkPageStream(harness.shimTab.mainFrame);

    const popup = await harness.parkPageStream(harness.popupFrame);

    // 1Password closes its persistent store, which Chrome leaves open
    await harness.reportAccessLevel({ area: "local", accessLevel: "TRUSTED_CONTEXTS" });

    // A change stamped by a worker whose own record had not caught up: either
    // record saying closed is enough, since neither is reliably the newer
    await harness.reportStorageChange({
      area: "local",
      changes: CHANGES,
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });

    expect(await popup.waitForEnvelopes(1)).toEqual([
      {
        kind: "storageChanged",
        area: "local",
        changes: CHANGES,
      } satisfies RuntimeProxyPageEnvelope,
    ]);

    expect(contentScript.envelopes).toEqual([]);
  });

  test("is refused from any session but the worker's", async () => {
    const harness = createHarness();

    const contentScript = await harness.parkPageStream(harness.shimTab.mainFrame);

    const response = await harness.shimSession.request(
      RUNTIME_PROXY_PATHS.workerStorageChanged,
      SHIM_TOKEN,
      { area: "local", changes: CHANGES, accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" },
      harness.shimTab.mainFrame,
    );

    expect(response.status).toBe(403);

    expect(contentScript.envelopes).toEqual([]);
  });

  test("a report the relay cannot read fans nothing out", async () => {
    const harness = createHarness();

    const contentScript = await harness.parkPageStream(harness.shimTab.mainFrame);

    for (const body of [
      { area: "somewhere-else", changes: CHANGES, accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" },
      { area: "local", changes: "not an object", accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" },
      { area: "local", changes: CHANGES, accessLevel: "SOMETHING_ELSE" },
    ]) {
      // Taken rather than refused: a report main cannot read is the worker's
      // mistake to fix, and there is nothing for it to do about a 400
      expect((await harness.reportStorageChange(body)).status).toBe(204);
    }

    expect(contentScript.envelopes).toEqual([]);
  });
});
