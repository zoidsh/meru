import { afterEach, describe, expect, test } from "bun:test";
import { callInCallbackForm } from "../facade/lib/callback-form";
import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import { encodeNativeMessage } from "../native-messaging/framing";
import {
  PORT_CLOSED_ERROR,
  RECEIVING_END_ERROR,
  type RuntimeProxyPageEnvelope,
  type RuntimeProxySender,
  RUNTIME_PROXY_PATHS,
} from "./bridge-protocol";
import { proxyPageMessaging } from "./page-messaging";

const EXTENSION_ID = "nngceckbapebfimnlniiiahkandclblb";

const PAGE_URL = `chrome-extension://${EXTENSION_ID}/popup/index.html`;

const contextGlobals = globalThis as unknown as {
  chrome?: ChromeNamespace;
  location?: { href: string };
  fetch: typeof fetch;
};

const originalFetch = contextGlobals.fetch;

const stoppedOnTeardown: { stop: () => void }[] = [];

afterEach(() => {
  contextGlobals.fetch = originalFetch;

  delete contextGlobals.chrome;

  delete contextGlobals.location;

  for (const client of stoppedOnTeardown.splice(0)) {
    client.stop();
  }
});

async function waitFor(condition: () => boolean, what: string) {
  const deadline = Date.now() + 1000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

type Post = { pathName: string; body: Record<string, unknown> };

/** Main's end: a parked page stream, and an answer per path. */
function stubBridge(answers: Record<string, unknown> = {}) {
  const posts: Post[] = [];

  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

  contextGlobals.fetch = (async (url: string, init: RequestInit) => {
    const { pathname: pathName } = new URL(url);

    posts.push({ pathName, body: JSON.parse(init.body as string) as Record<string, unknown> });

    if (pathName === RUNTIME_PROXY_PATHS.pageStream) {
      return new Response(
        new ReadableStream<Uint8Array>({
          start: (controller) => {
            streamController = controller;
          },
        }),
      );
    }

    return pathName in answers
      ? Response.json(answers[pathName])
      : new Response(null, { status: 204 });
  }) as unknown as typeof fetch;

  return {
    posts,
    postsTo: (pathName: string) => posts.filter((post) => post.pathName === pathName),
    waitForStream: () => waitFor(() => streamController !== undefined, "a page stream"),
    push: (envelope: RuntimeProxyPageEnvelope) => {
      streamController?.enqueue(encodeNativeMessage(envelope));
    },
  };
}

function createNativeEvent() {
  const listeners: ChromeEventListener[] = [];

  return {
    listeners,
    addListener: (listener: ChromeEventListener) => {
      listeners.push(listener);
    },
    removeListener: () => undefined,
  };
}

type Port = {
  postMessage: (message: unknown) => void;
  onMessage: { addListener: (listener: (message: unknown) => void) => void };
  onDisconnect: { addListener: (listener: () => void) => void };
};

/** A worker-session page's `chrome`, with Electron's session-scoped `tabs`. */
function createPage({ nativeReply }: { nativeReply?: unknown } = {}) {
  const nativeSends: unknown[][] = [];

  const chrome: ChromeNamespace = {
    runtime: { id: EXTENSION_ID, onMessage: createNativeEvent(), onConnect: createNativeEvent() },
    tabs: {
      sendMessage: (...callArguments: unknown[]) => {
        nativeSends.push(callArguments);

        (callArguments.at(-1) as (reply: unknown) => void)(nativeReply);
      },
      connect: () => undefined,
    },
  };

  contextGlobals.chrome = chrome;

  contextGlobals.location = { href: PAGE_URL };

  const client = proxyPageMessaging(chrome);

  if (client) {
    stoppedOnTeardown.push(client);
  }

  return {
    nativeSends,
    runtime: chrome.runtime as ChromeNamespace,
    tabs: chrome.tabs as {
      sendMessage: (...callArguments: unknown[]) => Promise<unknown> | undefined;
      connect: (tabId: number, connectInfo?: Record<string, unknown>) => Port;
    },
    onMessage: (chrome.runtime as ChromeNamespace).onMessage as {
      addListener: (listener: ChromeEventListener) => void;
    },
  };
}

describe("proxyPageMessaging", () => {
  test("parks a stream as the page, and its listeners hear what main delivers", async () => {
    const stub = stubBridge();

    const { onMessage } = createPage();

    await stub.waitForStream();

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.pageStream)[0]?.body).toEqual({
      sender: { url: PAGE_URL, isTopFrame: true },
    });

    const heard: unknown[] = [];

    onMessage.addListener((message, sender) => {
      heard.push({ message, sender });
    });

    const sender = { id: EXTENSION_ID, tab: { id: 7 }, frameId: 0 } as RuntimeProxySender;

    stub.push({
      kind: "message",
      deliveryId: "delivery-1",
      message: { command: "collectPageDetailsResponse" },
      sender,
    });

    await waitFor(() => heard.length === 1, "the message");

    expect(heard).toEqual([{ message: { command: "collectPageDetailsResponse" }, sender }]);

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.pageReply).length === 1, "the reply");
  });

  test("tabs.sendMessage reaches a tab through main, in either form", async () => {
    const stub = stubBridge({
      [RUNTIME_PROXY_PATHS.workerSendToTab]: { status: "replied", reply: { collected: true } },
    });

    const { runtime, tabs } = createPage();

    expect(await tabs.sendMessage(7, { command: "collectPageDetails" }, { frameId: 0 })).toEqual({
      collected: true,
    });

    expect(
      await callInCallbackForm(runtime, tabs.sendMessage, 7, { command: "fillForm" }, null)
        .answered,
    ).toEqual({ collected: true });

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerSendToTab).map((post) => post.body)).toEqual([
      { tabId: 7, message: { command: "collectPageDetails" }, frameId: 0, workerUrl: PAGE_URL },
      { tabId: 7, message: { command: "fillForm" }, workerUrl: PAGE_URL },
    ]);
  });

  test("tabs.sendMessage fails the way Chrome does, with lastError in callback form", async () => {
    stubBridge({ [RUNTIME_PROXY_PATHS.workerSendToTab]: { status: "noListener" } });

    const { runtime, tabs } = createPage();

    await expect(tabs.sendMessage(7, "anyone")).rejects.toThrow(RECEIVING_END_ERROR);

    await expect(
      callInCallbackForm(runtime, tabs.sendMessage, 7, "anyone").answered,
    ).rejects.toThrow(RECEIVING_END_ERROR);
  });

  test("tabs.sendMessage to a closed port and to no tab", async () => {
    stubBridge({
      [RUNTIME_PROXY_PATHS.workerSendToTab]: { status: "noTarget", error: "No tab with id: 3." },
    });

    await expect(createPage().tabs.sendMessage(3, "anyone")).rejects.toThrow("No tab with id: 3.");

    stubBridge({ [RUNTIME_PROXY_PATHS.workerSendToTab]: { status: "closed" } });

    await expect(createPage().tabs.sendMessage(7, "anyone")).rejects.toThrow(PORT_CLOSED_ERROR);
  });

  test("tabs.sendMessage to a tab of the page's own session is Chromium's", async () => {
    stubBridge({ [RUNTIME_PROXY_PATHS.workerSendToTab]: { status: "ownSession" } });

    const { nativeSends, tabs } = createPage({ nativeReply: "native answer" });

    expect(await tabs.sendMessage(9, "hello")).toBe("native answer");

    expect(nativeSends).toEqual([[9, "hello", expect.any(Function)]]);
  });

  test("tabs.connect opens through main as the parked page, and hears the far end on its stream", async () => {
    const stub = stubBridge({ [RUNTIME_PROXY_PATHS.workerConnectToTab]: { status: "connected" } });

    const { tabs } = createPage();

    await stub.waitForStream();

    const port = tabs.connect(7, { name: "fill", frameId: 0 });

    const heard: unknown[] = [];

    port.onMessage.addListener((message) => {
      heard.push(message);
    });

    port.postMessage("marco");

    // Posts wait for the open, which waits for the stream to be named
    stub.push({ kind: "ready", contextId: "page-context" });

    await waitFor(
      () => stub.postsTo(RUNTIME_PROXY_PATHS.workerPortPost).length === 1,
      "the port post",
    );

    const [connect] = stub.postsTo(RUNTIME_PROXY_PATHS.workerConnectToTab);

    expect(connect?.body).toMatchObject({
      name: "fill",
      tabId: 7,
      frameId: 0,
      workerUrl: PAGE_URL,
      contextId: "page-context",
    });

    const portId = connect?.body.portId;

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerPortPost)[0]?.body).toEqual({
      portId,
      message: "marco",
    });

    stub.push({ kind: "portMessage", portId: portId as string, message: "polo" });

    await waitFor(() => heard.length === 1, "the far end's message");

    expect(heard).toEqual(["polo"]);
  });

  test("a port the far end hangs up on disconnects with Chrome's error", async () => {
    const stub = stubBridge({ [RUNTIME_PROXY_PATHS.workerConnectToTab]: { status: "noListener" } });

    const { runtime, tabs } = createPage();

    await stub.waitForStream();

    stub.push({ kind: "ready", contextId: "page-context" });

    const port = tabs.connect(7);

    const disconnectErrors: unknown[] = [];

    port.onDisconnect.addListener(() => {
      disconnectErrors.push((runtime.lastError as { message?: string } | undefined)?.message);
    });

    await waitFor(() => disconnectErrors.length === 1, "the disconnect");

    expect(disconnectErrors).toEqual([RECEIVING_END_ERROR]);
  });
});
