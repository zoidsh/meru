import { afterEach, describe, expect, test } from "bun:test";
import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import { encodeNativeMessage } from "../native-messaging/framing";
import {
  type RuntimeProxyPageEnvelope,
  type RuntimeProxySender,
  RUNTIME_PROXY_PATHS,
} from "./bridge-protocol";
import { createPageStreamClient } from "./page-stream-client";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const SENDER_REPORT = { url: "https://accounts.google.com/signin", isTopFrame: true };

/** What the worker looks like to a shimmed context: the extension itself. */
const WORKER_SENDER: RuntimeProxySender = {
  id: EXTENSION_ID,
  origin: `chrome-extension://${EXTENSION_ID}`,
};

const originalFetch = globalThis.fetch;

const startedClients: { stop: () => void }[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;

  for (const client of startedClients.splice(0)) {
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

type RecordedPost = { pathName: string; body: Record<string, unknown> };

function stubBridge() {
  const posts: RecordedPost[] = [];

  const streamControllers: ReadableStreamDefaultController<Uint8Array>[] = [];

  const refusals = new Map<string, number>();

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const { pathname: pathName } = new URL(url);

    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    posts.push({ pathName, body });

    const refusalStatus = refusals.get(pathName);

    if (refusalStatus !== undefined) {
      return new Response(null, { status: refusalStatus });
    }

    if (pathName === RUNTIME_PROXY_PATHS.pageStream) {
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          streamControllers.push(controller);
        },
      });

      return new Response(stream, { status: 200 });
    }

    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;

  return {
    posts,
    refuse: (pathName: string, status: number) => {
      refusals.set(pathName, status);
    },
    allow: (pathName: string) => {
      refusals.delete(pathName);
    },
    postsTo: (pathName: string) => posts.filter((post) => post.pathName === pathName),
    waitForStream: async (streamCount = 1) => {
      await waitFor(() => streamControllers.length >= streamCount, `${streamCount} page streams`);

      return streamControllers[streamCount - 1] as ReadableStreamDefaultController<Uint8Array>;
    },
    endStream: () => {
      streamControllers.at(-1)?.close();
    },
    push: (envelope: RuntimeProxyPageEnvelope) => {
      streamControllers.at(-1)?.enqueue(encodeNativeMessage(envelope));
    },
    waitForPost: (pathName: string, postCount = 1) =>
      waitFor(
        () => posts.filter((post) => post.pathName === pathName).length >= postCount,
        `${postCount} posts to ${pathName}`,
      ),
  };
}

function createNativeEvent() {
  const listeners: ChromeEventListener[] = [];

  return {
    listeners,
    addListener: (listener: ChromeEventListener) => {
      listeners.push(listener);
    },
    removeListener: (listener: ChromeEventListener) => {
      listeners.splice(listeners.indexOf(listener), 1);
    },
  };
}

type WrappedEvent = {
  addListener: (listener: ChromeEventListener) => void;
  removeListener: (listener: ChromeEventListener) => void;
  hasListeners: () => boolean;
};

type Port = {
  name: string;
  sender?: RuntimeProxySender;
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: WrappedEvent;
  onDisconnect: WrappedEvent;
};

function startClient() {
  const chrome: ChromeNamespace = {
    runtime: {
      id: EXTENSION_ID,
      onMessage: createNativeEvent(),
      onConnect: createNativeEvent(),
    },
  };

  const client = createPageStreamClient({
    getSenderReport: () => SENDER_REPORT,
    retryDelayMs: 5,
  });

  client.wrapRuntime(chrome);

  client.start();

  startedClients.push(client);

  const runtime = chrome.runtime as ChromeNamespace;

  return {
    client,
    runtime,
    onMessage: runtime.onMessage as WrappedEvent,
    onConnect: runtime.onConnect as WrappedEvent,
  };
}

describe("createPageStreamClient", () => {
  test("parks a stream carrying what this context can say about itself", async () => {
    const stub = stubBridge();

    startClient();

    await stub.waitForStream();

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.pageStream)[0]?.body).toEqual({
      sender: SENDER_REPORT,
    });
  });

  test("parks the stream again when it ends", async () => {
    const stub = stubBridge();

    startClient();

    await stub.waitForStream();

    stub.endStream();

    await stub.waitForStream(2);
  });

  test("parks the stream again after the bridge refused it", async () => {
    const stub = stubBridge();

    stub.refuse(RUNTIME_PROXY_PATHS.pageStream, 403);

    startClient();

    await stub.waitForPost(RUNTIME_PROXY_PATHS.pageStream);

    stub.allow(RUNTIME_PROXY_PATHS.pageStream);

    await stub.waitForStream();
  });

  test("dispatches a message to the listeners and answers with the reply", async () => {
    const stub = stubBridge();

    const { onMessage } = startClient();

    const heard: { message: unknown; sender: unknown }[] = [];

    onMessage.addListener((message, sender, sendResponse) => {
      heard.push({ message, sender });

      (sendResponse as (reply: unknown) => void)({ filled: true });

      return undefined;
    });

    await stub.waitForStream();

    stub.push({
      kind: "message",
      deliveryId: "delivery-1",
      message: { kind: "fill" },
      sender: WORKER_SENDER,
    });

    await stub.waitForPost(RUNTIME_PROXY_PATHS.pageReply);

    expect(heard).toEqual([{ message: { kind: "fill" }, sender: WORKER_SENDER }]);

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.pageReply)[0]?.body).toEqual({
      deliveryId: "delivery-1",
      result: { status: "replied", reply: { filled: true } },
    });
  });

  test("a context with no listener answers that there is no receiving end", async () => {
    const stub = stubBridge();

    startClient();

    await stub.waitForStream();

    stub.push({
      kind: "message",
      deliveryId: "delivery-2",
      message: "anyone",
      sender: WORKER_SENDER,
    });

    await stub.waitForPost(RUNTIME_PROXY_PATHS.pageReply);

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.pageReply)[0]?.body).toEqual({
      deliveryId: "delivery-2",
      result: { status: "noListener" },
    });
  });

  test("a listener that takes the message and never answers closes the port", async () => {
    const stub = stubBridge();

    const { onMessage } = startClient();

    onMessage.addListener(() => undefined);

    await stub.waitForStream();

    stub.push({
      kind: "message",
      deliveryId: "delivery-3",
      message: "answer me",
      sender: WORKER_SENDER,
    });

    await stub.waitForPost(RUNTIME_PROXY_PATHS.pageReply);

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.pageReply)[0]?.body).toMatchObject({
      result: { status: "closed" },
    });
  });

  test("a listener that returns true keeps the channel open for a later answer", async () => {
    const stub = stubBridge();

    const { onMessage } = startClient();

    let answer: ((reply: unknown) => void) | undefined;

    onMessage.addListener((_message, _sender, sendResponse) => {
      answer = sendResponse as (reply: unknown) => void;

      return true;
    });

    await stub.waitForStream();

    stub.push({
      kind: "message",
      deliveryId: "delivery-4",
      message: "unlock",
      sender: WORKER_SENDER,
    });

    await waitFor(() => answer !== undefined, "the listener to be called");

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.pageReply)).toEqual([]);

    answer?.("unlocked");

    await stub.waitForPost(RUNTIME_PROXY_PATHS.pageReply);

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.pageReply)[0]?.body).toMatchObject({
      result: { status: "replied", reply: "unlocked" },
    });
  });

  test("a connect hands the listeners a port that posts, hears and hangs up", async () => {
    const stub = stubBridge();

    const { onConnect } = startClient();

    const ports: Port[] = [];

    onConnect.addListener((port) => {
      ports.push(port as Port);
    });

    await stub.waitForStream();

    stub.push({ kind: "connect", portId: "port-1", name: "fill", sender: WORKER_SENDER });

    await waitFor(() => ports.length === 1, "the port");

    const port = ports[0] as Port;

    expect(port.name).toBe("fill");
    expect(port.sender).toEqual(WORKER_SENDER);

    const heard: unknown[] = [];

    port.onMessage.addListener((message) => {
      heard.push(message);
    });

    stub.push({ kind: "portMessage", portId: "port-1", message: "marco" });

    await waitFor(() => heard.length === 1, "the port message");

    expect(heard).toEqual(["marco"]);

    port.postMessage("polo");

    await stub.waitForPost(RUNTIME_PROXY_PATHS.portPost);

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.portPost)[0]?.body).toEqual({
      portId: "port-1",
      message: "polo",
    });

    port.disconnect();

    await stub.waitForPost(RUNTIME_PROXY_PATHS.portDisconnect);

    expect(() => {
      port.postMessage("after");
    }).toThrow();
  });

  test("a connect nothing here listens for is hung up on", async () => {
    const stub = stubBridge();

    startClient();

    await stub.waitForStream();

    stub.push({ kind: "connect", portId: "port-2", name: "fill", sender: WORKER_SENDER });

    await stub.waitForPost(RUNTIME_PROXY_PATHS.portDisconnect);

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.portDisconnect)[0]?.body).toEqual({
      portId: "port-2",
    });
  });

  test("the worker hanging up reaches the port's own listeners", async () => {
    const stub = stubBridge();

    const { onConnect } = startClient();

    const ports: Port[] = [];

    onConnect.addListener((port) => {
      ports.push(port as Port);
    });

    await stub.waitForStream();

    stub.push({ kind: "connect", portId: "port-3", sender: WORKER_SENDER });

    await waitFor(() => ports.length === 1, "the port");

    const port = ports[0] as Port;

    let isDisconnected = false;

    port.onDisconnect.addListener(() => {
      isDisconnected = true;
    });

    stub.push({ kind: "portDisconnect", portId: "port-3" });

    await waitFor(() => isDisconnected, "the disconnect");

    // Chrome reports a port the far end closed without telling the extension
    // anything went wrong, and nothing more is sent on it
    expect(stub.postsTo(RUNTIME_PROXY_PATHS.portDisconnect)).toEqual([]);
  });
});
