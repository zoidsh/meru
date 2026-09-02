import { afterEach, describe, expect, test } from "bun:test";
import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import { encodeNativeMessage } from "../native-messaging/framing";
import {
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyJob,
  type RuntimeProxySender,
} from "./bridge-protocol";
import { createRelayClient } from "./relay-client";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const SENDER: RuntimeProxySender = {
  id: EXTENSION_ID,
  url: "https://accounts.google.com/",
  origin: "https://accounts.google.com",
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

    if (pathName === RUNTIME_PROXY_PATHS.workerJobs) {
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
    postsTo: (pathName: string) => posts.filter((post) => post.pathName === pathName),
    waitForStream: async (streamCount = 1) => {
      await waitFor(() => streamControllers.length >= streamCount, `${streamCount} job streams`);

      return streamControllers[streamCount - 1] as ReadableStreamDefaultController<Uint8Array>;
    },
    pushJob: (job: RuntimeProxyJob) => {
      streamControllers.at(-1)?.enqueue(encodeNativeMessage(job));
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
    removeListener: (listener: ChromeEventListener) => {
      listeners.splice(listeners.indexOf(listener), 1);
    },
  };
}

function createWorkerChrome() {
  const nativeOnMessage = createNativeEvent();

  const nativeOnConnect = createNativeEvent();

  const chrome: ChromeNamespace = {
    runtime: { id: EXTENSION_ID, onMessage: nativeOnMessage, onConnect: nativeOnConnect },
  };

  return { chrome, nativeOnMessage, nativeOnConnect };
}

type WrappedEvent = {
  addListener: (listener: ChromeEventListener) => void;
  removeListener: (listener: ChromeEventListener) => void;
  hasListener: (listener: ChromeEventListener) => boolean;
  hasListeners: () => boolean;
};

function startClient(chromeObjects: ChromeNamespace[], maxRememberedJobIds?: number) {
  const client = createRelayClient({ retryDelayMs: 5, maxRememberedJobIds });

  for (const chrome of chromeObjects) {
    client.wrapRuntime(chrome);
  }

  client.start();

  startedClients.push(client);

  return client;
}

describe("createRelayClient", () => {
  test("wraps the events and keeps registering listeners natively", () => {
    const { chrome, nativeOnMessage } = createWorkerChrome();

    const client = createRelayClient();

    client.wrapRuntime(chrome);

    const runtime = chrome.runtime as ChromeNamespace;

    const onMessage = runtime.onMessage as WrappedEvent;

    const listener = () => undefined;

    onMessage.addListener(listener);

    expect(nativeOnMessage.listeners).toEqual([listener]);
    expect(onMessage.hasListener(listener)).toBe(true);
    expect(onMessage.hasListeners()).toBe(true);

    onMessage.removeListener(listener);

    expect(nativeOnMessage.listeners).toEqual([]);
    expect(onMessage.hasListeners()).toBe(false);
  });

  test("chrome and browser share one set of mirrored listeners", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    const browser: ChromeNamespace = {
      runtime: { id: EXTENSION_ID, onMessage: createNativeEvent(), onConnect: createNativeEvent() },
    };

    startClient([chrome, browser]);

    const heard: unknown[] = [];

    ((browser.runtime as ChromeNamespace).onMessage as WrappedEvent).addListener((message) => {
      heard.push(message);
    });

    await stub.waitForStream();

    stub.pushJob({ type: "sendMessage", jobId: "job-1", message: "via browser", sender: SENDER });

    await waitFor(() => heard.length === 1, "the browser-registered listener");
  });

  test("acks a job before answering it, and answers with the first response", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    const runtime = chrome.runtime as ChromeNamespace;

    (runtime.onMessage as WrappedEvent).addListener((_message, _sender, sendResponse) => {
      (sendResponse as (response: unknown) => void)({ unlocked: true });
    });

    await stub.waitForStream();

    stub.pushJob({
      type: "sendMessage",
      jobId: "job-1",
      message: { kind: "unlock" },
      sender: SENDER,
    });

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerReply).length === 1, "the reply");

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerAck)).toEqual([
      { pathName: RUNTIME_PROXY_PATHS.workerAck, body: { jobId: "job-1" } },
    ]);

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerReply)[0]?.body).toEqual({
      jobId: "job-1",
      result: { status: "replied", reply: { unlocked: true } },
    });
  });

  /*
   * The relay redelivers anything it holds no ack for, and an ack can go
   * missing on its own since a failed POST is swallowed. A redelivered job that
   * ran here already must not run again: for anything that changes state —
   * unlocking a vault, saving an item — a second dispatch is a double apply
   * rather than a retry.
   */
  test("a redelivered job is acked again but never dispatched twice", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    const heard: unknown[] = [];

    ((chrome.runtime as ChromeNamespace).onMessage as WrappedEvent).addListener(
      (message, _sender, sendResponse) => {
        heard.push(message);

        (sendResponse as (response: unknown) => void)({ unlocked: true });
      },
    );

    await stub.waitForStream();

    const job = {
      type: "sendMessage" as const,
      jobId: "job-1",
      message: { kind: "unlock" },
      sender: SENDER,
    };

    stub.pushJob(job);

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerReply).length === 1, "the reply");

    stub.pushJob(job);

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerAck).length === 2, "the second ack");

    expect(heard).toEqual([{ kind: "unlock" }]);
    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerReply)).toHaveLength(1);
  });

  /*
   * The set of handled ids is bounded, so a worker that lives for hours cannot
   * grow one without limit. Eviction is oldest-first, and a job old enough to
   * be forgotten runs again: at-least-once is the guarantee that survives, and
   * running a very old job twice beats never running a new one.
   */
  test("the handled-job memory is bounded, and forgets oldest first", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome], 2);

    const heard: unknown[] = [];

    ((chrome.runtime as ChromeNamespace).onMessage as WrappedEvent).addListener(
      (message, _sender, sendResponse) => {
        heard.push(message);

        (sendResponse as (response: unknown) => void)({ unlocked: true });
      },
    );

    await stub.waitForStream();

    const jobAt = (index: number) => ({
      type: "sendMessage" as const,
      jobId: `job-${index}`,
      message: { index },
      sender: SENDER,
    });

    // Three against a bound of two, so the first id is the one evicted
    for (const index of [1, 2, 3]) {
      stub.pushJob(jobAt(index));
    }

    await waitFor(
      () => stub.postsTo(RUNTIME_PROXY_PATHS.workerReply).length === 3,
      "three replies",
    );

    // Still remembered, so it is acked and not run again
    stub.pushJob(jobAt(3));

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerAck).length === 4, "the fourth ack");

    expect(heard).toEqual([{ index: 1 }, { index: 2 }, { index: 3 }]);

    // Forgotten, so it runs a second time
    stub.pushJob(jobAt(1));

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerReply).length === 4, "the rerun");

    expect(heard).toEqual([{ index: 1 }, { index: 2 }, { index: 3 }, { index: 1 }]);
  });

  test("a redelivered connect does not open the port a second time", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    const connected: unknown[] = [];

    ((chrome.runtime as ChromeNamespace).onConnect as WrappedEvent).addListener((port) => {
      connected.push(port);
    });

    await stub.waitForStream();

    const job = {
      type: "connect" as const,
      jobId: "job-1",
      portId: "port-1",
      name: "relay",
      sender: SENDER,
    };

    stub.pushJob(job);

    await waitFor(() => connected.length === 1, "the port");

    stub.pushJob(job);

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerAck).length === 2, "the second ack");

    expect(connected).toHaveLength(1);
  });

  test("a listener returning true keeps the channel open for a later response", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    let respondLater: ((response: unknown) => void) | undefined;

    ((chrome.runtime as ChromeNamespace).onMessage as WrappedEvent).addListener(
      (_message, _sender, sendResponse) => {
        respondLater = sendResponse as (response: unknown) => void;

        return true;
      },
    );

    await stub.waitForStream();

    stub.pushJob({ type: "sendMessage", jobId: "job-1", message: "wait", sender: SENDER });

    await waitFor(() => respondLater !== undefined, "the listener");

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerReply)).toEqual([]);

    respondLater?.("took a while");

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerReply).length === 1, "the reply");

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerReply)[0]?.body).toEqual({
      jobId: "job-1",
      result: { status: "replied", reply: "took a while" },
    });
  });

  test("answers noListener with nothing registered, and closed when nobody responds", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    await stub.waitForStream();

    stub.pushJob({ type: "sendMessage", jobId: "job-1", message: "anyone?", sender: SENDER });

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerReply).length === 1, "the reply");

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerReply)[0]?.body).toEqual({
      jobId: "job-1",
      result: { status: "noListener" },
    });

    ((chrome.runtime as ChromeNamespace).onMessage as WrappedEvent).addListener(() => undefined);

    stub.pushJob({ type: "sendMessage", jobId: "job-2", message: "still there?", sender: SENDER });

    await waitFor(
      () => stub.postsTo(RUNTIME_PROXY_PATHS.workerReply).length === 2,
      "the second reply",
    );

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerReply)[1]?.body).toEqual({
      jobId: "job-2",
      result: { status: "closed" },
    });
  });

  // Chrome fails a `sendResponse` it cannot clone right away. A reply the
  // bridge cannot serialize would otherwise post nothing at all, leaving the
  // caller on the relay's in-flight timeout, minutes away
  test("a reply that cannot be serialized answers closed rather than nothing", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    const runtime = chrome.runtime as ChromeNamespace;

    (runtime.onMessage as WrappedEvent).addListener((_message, _sender, sendResponse) => {
      (sendResponse as (response: unknown) => void)({ vaultId: 1n });
    });

    await stub.waitForStream();

    stub.pushJob({ type: "sendMessage", jobId: "job-1", message: "unlock", sender: SENDER });

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerReply).length === 1, "the reply");

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerReply)[0]?.body).toEqual({
      jobId: "job-1",
      result: { status: "closed" },
    });
  });

  test("builds a port for a connect job and carries it both ways", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    const runtime = chrome.runtime as ChromeNamespace;

    type WorkerPort = {
      name: string;
      sender: RuntimeProxySender;
      postMessage: (message: unknown) => void;
      disconnect: () => void;
      onMessage: WrappedEvent;
      onDisconnect: WrappedEvent;
    };

    let port: WorkerPort | undefined;

    (runtime.onConnect as WrappedEvent).addListener((connectedPort) => {
      port = connectedPort as WorkerPort;
    });

    await stub.waitForStream();

    stub.pushJob({
      type: "connect",
      jobId: "job-1",
      portId: "port-1",
      name: "relay",
      sender: SENDER,
    });

    await waitFor(() => port !== undefined, "the port");

    expect(port?.name).toBe("relay");
    expect(port?.sender).toEqual(SENDER);

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerReply)[0]?.body).toEqual({
      jobId: "job-1",
      result: { status: "connected" },
    });

    // Worker to content script, in the order it was written
    port?.postMessage("first");

    port?.postMessage("second");

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerPortPost).length === 2, "the posts");

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerPortPost).map(({ body }) => body)).toEqual([
      { portId: "port-1", message: "first" },
      { portId: "port-1", message: "second" },
    ]);

    // Content script to worker
    const heard: unknown[] = [];

    port?.onMessage.addListener((message) => {
      heard.push(message);
    });

    stub.pushJob({ type: "portMessage", jobId: "job-2", portId: "port-1", message: "fill" });

    await waitFor(() => heard.length === 1, "the port message");

    expect(heard).toEqual(["fill"]);

    // The far side hangs up
    let disconnectHeard = false;

    port?.onDisconnect.addListener(() => {
      disconnectHeard = true;
    });

    stub.pushJob({ type: "portDisconnect", jobId: "job-3", portId: "port-1" });

    await waitFor(() => disconnectHeard, "the disconnect");

    expect(() => port?.postMessage("too late")).toThrow(
      "Attempting to use a disconnected port object",
    );
  });

  test("answers a connect nothing listens to with noListener", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    await stub.waitForStream();

    stub.pushJob({ type: "connect", jobId: "job-1", portId: "port-1", name: "x", sender: SENDER });

    await waitFor(() => stub.postsTo(RUNTIME_PROXY_PATHS.workerReply).length === 1, "the reply");

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerReply)[0]?.body).toEqual({
      jobId: "job-1",
      result: { status: "noListener" },
    });
  });

  test("disconnecting from the worker side tells the relay", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    let port: { disconnect: () => void } | undefined;

    ((chrome.runtime as ChromeNamespace).onConnect as WrappedEvent).addListener((connectedPort) => {
      port = connectedPort as { disconnect: () => void };
    });

    await stub.waitForStream();

    stub.pushJob({
      type: "connect",
      jobId: "job-1",
      portId: "port-1",
      name: "relay",
      sender: SENDER,
    });

    await waitFor(() => port !== undefined, "the port");

    port?.disconnect();

    await waitFor(
      () => stub.postsTo(RUNTIME_PROXY_PATHS.workerPortDisconnect).length === 1,
      "the disconnect post",
    );

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerPortDisconnect)[0]?.body).toEqual({
      portId: "port-1",
    });
  });

  test("a message posted before a disconnect goes out ahead of it", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    type OrderedPort = { postMessage: (message: unknown) => void; disconnect: () => void };

    let port: OrderedPort | undefined;

    ((chrome.runtime as ChromeNamespace).onConnect as WrappedEvent).addListener((connectedPort) => {
      port = connectedPort as OrderedPort;
    });

    await stub.waitForStream();

    stub.pushJob({
      type: "connect",
      jobId: "job-1",
      portId: "port-1",
      name: "relay",
      sender: SENDER,
    });

    await waitFor(() => port !== undefined, "the port");

    port?.postMessage("first");

    port?.disconnect();

    await waitFor(
      () => stub.postsTo(RUNTIME_PROXY_PATHS.workerPortDisconnect).length === 1,
      "the disconnect post",
    );

    const portPaths: string[] = [
      RUNTIME_PROXY_PATHS.workerPortPost,
      RUNTIME_PROXY_PATHS.workerPortDisconnect,
    ];

    expect(
      stub.posts.map(({ pathName }) => pathName).filter((pathName) => portPaths.includes(pathName)),
    ).toEqual(portPaths);
  });

  test("a refused post tears the worker port down with lastError set", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    // Two distinct runtime objects, as Electron builds them, so a `lastError`
    // set on only the one the port happened to be created under would show
    const browser: ChromeNamespace = {
      runtime: { id: EXTENSION_ID, onMessage: createNativeEvent(), onConnect: createNativeEvent() },
    };

    startClient([chrome, browser]);

    const runtime = chrome.runtime as ChromeNamespace;

    const browserRuntime = browser.runtime as ChromeNamespace;

    type RefusedPort = {
      postMessage: (message: unknown) => void;
      onDisconnect: WrappedEvent;
    };

    let port: RefusedPort | undefined;

    (runtime.onConnect as WrappedEvent).addListener((connectedPort) => {
      port = connectedPort as RefusedPort;
    });

    await stub.waitForStream();

    stub.pushJob({
      type: "connect",
      jobId: "job-1",
      portId: "port-1",
      name: "relay",
      sender: SENDER,
    });

    await waitFor(() => port !== undefined, "the port");

    let lastErrorDuringListener: unknown;

    let browserLastErrorDuringListener: unknown;

    port?.onDisconnect.addListener(() => {
      lastErrorDuringListener = runtime.lastError;

      browserLastErrorDuringListener = browserRuntime.lastError;
    });

    // What a session already at its cap of bodies read at once answers
    stub.refuse(RUNTIME_PROXY_PATHS.workerPortPost, 429);

    port?.postMessage("refused");

    await waitFor(
      () => stub.postsTo(RUNTIME_PROXY_PATHS.workerPortDisconnect).length === 1,
      "the disconnect post",
    );

    expect(lastErrorDuringListener).toEqual({ message: "The runtime proxy bridge answered 429" });
    expect(browserLastErrorDuringListener).toEqual({
      message: "The runtime proxy bridge answered 429",
    });

    expect(runtime.lastError).toBeUndefined();
    expect(browserRuntime.lastError).toBeUndefined();

    expect(stub.postsTo(RUNTIME_PROXY_PATHS.workerPortDisconnect)[0]?.body).toEqual({
      portId: "port-1",
    });

    expect(() => port?.postMessage("too late")).toThrow(
      "Attempting to use a disconnected port object",
    );
  });

  test("parks a fresh job stream when the previous one ends", async () => {
    const stub = stubBridge();

    const { chrome } = createWorkerChrome();

    startClient([chrome]);

    const firstController = await stub.waitForStream();

    firstController.close();

    await stub.waitForStream(2);

    const heard: unknown[] = [];

    ((chrome.runtime as ChromeNamespace).onMessage as WrappedEvent).addListener(
      (message, _sender, sendResponse) => {
        heard.push(message);

        (sendResponse as (response: unknown) => void)("still here");
      },
    );

    stub.pushJob({ type: "sendMessage", jobId: "job-1", message: "after restart", sender: SENDER });

    await waitFor(() => heard.length === 1, "the redelivered job");
  });
});
