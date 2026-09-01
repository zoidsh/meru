import { afterEach, describe, expect, test } from "bun:test";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { encodeNativeMessage } from "../native-messaging/framing";
import {
  PORT_CLOSED_ERROR,
  RECEIVING_END_ERROR,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyPortFrame,
} from "./bridge-protocol";
import { installRuntimeProxyShim, parseSendMessageArguments } from "./shim";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const OTHER_EXTENSION_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const SENDER_REPORT = { url: "https://accounts.google.com/", isTopFrame: true };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type RecordedRequest = { pathName: string; body: Record<string, unknown> };

async function waitFor(condition: () => boolean, what: string) {
  const deadline = Date.now() + 1000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function stubFetch(
  respond: (pathName: string, body: Record<string, unknown>) => Response | Promise<Response>,
) {
  const requests: RecordedRequest[] = [];

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    const { pathname: pathName } = new URL(url);

    requests.push({ pathName, body });

    return respond(pathName, body);
  }) as unknown as typeof fetch;

  return requests;
}

function createShimmedRuntime(nativeMethods: Record<string, unknown> = {}) {
  const runtime: ChromeNamespace = { id: EXTENSION_ID, ...nativeMethods };

  installRuntimeProxyShim({ runtime }, { getSenderReport: () => SENDER_REPORT });

  return runtime;
}

type SendMessage = (...callArguments: unknown[]) => Promise<unknown> | undefined;

type Connect = (connectInfo?: unknown) => {
  name: string;
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: { addListener: (listener: (...eventArguments: unknown[]) => void) => void };
  onDisconnect: { addListener: (listener: (...eventArguments: unknown[]) => void) => void };
};

describe("parseSendMessageArguments", () => {
  test("one argument is the message, whatever it looks like", () => {
    expect(parseSendMessageArguments([{ kind: "unlock" }])).toEqual({
      message: { kind: "unlock" },
    });

    // Even a string that reads as an extension id
    expect(parseSendMessageArguments([EXTENSION_ID])).toEqual({ message: EXTENSION_ID });
  });

  test("a leading extension id is the target with three arguments, or with two when it reads as one", () => {
    expect(parseSendMessageArguments([EXTENSION_ID, "hello", {}])).toEqual({
      targetExtensionId: EXTENSION_ID,
      message: "hello",
    });

    expect(parseSendMessageArguments([EXTENSION_ID, "hello"])).toEqual({
      targetExtensionId: EXTENSION_ID,
      message: "hello",
    });

    expect(parseSendMessageArguments(["not an id", { kind: "unlock" }])).toEqual({
      message: "not an id",
    });
  });
});

describe("shimmed sendMessage", () => {
  test("posts the message with the sender report and resolves the reply", async () => {
    const requests = stubFetch(() => Response.json({ status: "replied", reply: { ok: true } }));

    const runtime = createShimmedRuntime();

    const reply = await (runtime.sendMessage as SendMessage)({ kind: "unlock" });

    expect(reply).toEqual({ ok: true });

    expect(requests).toEqual([
      {
        pathName: RUNTIME_PROXY_PATHS.sendMessage,
        body: { message: { kind: "unlock" }, sender: SENDER_REPORT },
      },
    ]);
  });

  test("hands the reply to a callback and sets no lastError", async () => {
    stubFetch(() => Response.json({ status: "replied", reply: "hi" }));

    const runtime = createShimmedRuntime();

    const { reply, lastErrorDuringCallback } = await new Promise<{
      reply: unknown;
      lastErrorDuringCallback: unknown;
    }>((resolve) => {
      (runtime.sendMessage as SendMessage)("hello", (callbackReply: unknown) => {
        resolve({ reply: callbackReply, lastErrorDuringCallback: runtime.lastError });
      });
    });

    expect(reply).toBe("hi");
    expect(lastErrorDuringCallback).toBeUndefined();
    expect(runtime.lastError).toBeUndefined();
  });

  test("maps noListener to Chrome's receiving-end rejection", async () => {
    stubFetch(() => Response.json({ status: "noListener" }));

    const runtime = createShimmedRuntime();

    expect((runtime.sendMessage as SendMessage)("anyone?")).rejects.toThrow(RECEIVING_END_ERROR);
  });

  test("maps closed to Chrome's message-port error, on lastError for a callback", async () => {
    stubFetch(() => Response.json({ status: "closed" }));

    const runtime = createShimmedRuntime();

    const lastErrorDuringCallback = await new Promise<unknown>((resolve) => {
      (runtime.sendMessage as SendMessage)("hello", () => {
        resolve(runtime.lastError);
      });
    });

    expect(lastErrorDuringCallback).toEqual({ message: PORT_CLOSED_ERROR });
    expect(runtime.lastError).toBeUndefined();
  });

  test("an unreachable bridge reads like a missing receiving end", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Failed to fetch");
    }) as unknown as typeof fetch;

    const runtime = createShimmedRuntime();

    expect((runtime.sendMessage as SendMessage)("hello")).rejects.toThrow(RECEIVING_END_ERROR);
  });

  test("leaves a message for another extension to the native method", async () => {
    const nativeCalls: unknown[][] = [];

    stubFetch(() => Response.json({ status: "replied" }));

    const runtime = createShimmedRuntime({
      sendMessage: (...callArguments: unknown[]) => {
        nativeCalls.push(callArguments);

        return Promise.resolve("native");
      },
    });

    const reply = await (runtime.sendMessage as SendMessage)(OTHER_EXTENSION_ID, "hello", {});

    expect(reply).toBe("native");
    expect(nativeCalls).toEqual([[OTHER_EXTENSION_ID, "hello", {}]]);
  });
});

describe("shimmed connect", () => {
  function respondWithPortStream(frames: {
    enqueue?: (controller: ReadableStreamDefaultController<Uint8Array>) => void;
  }) {
    return (pathName: string) => {
      if (pathName !== RUNTIME_PROXY_PATHS.connect) {
        return new Response(null, { status: 204 });
      }

      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          frames.enqueue?.(controller);
        },
      });

      return new Response(stream, { status: 200 });
    };
  }

  const encodeFrame = (frame: RuntimeProxyPortFrame) => encodeNativeMessage(frame);

  test("opens the port over the bridge and delivers streamed messages", async () => {
    const requests = stubFetch(
      respondWithPortStream({
        enqueue: (controller) => {
          controller.enqueue(encodeFrame({ type: "message", message: { locked: false } }));
        },
      }),
    );

    const runtime = createShimmedRuntime();

    const port = (runtime.connect as Connect)({ name: "relay" });

    expect(port.name).toBe("relay");

    const message = await new Promise<unknown>((resolve) => {
      port.onMessage.addListener((portMessage) => {
        resolve(portMessage);
      });
    });

    expect(message).toEqual({ locked: false });

    expect(requests[0]?.body).toMatchObject({ name: "relay", sender: SENDER_REPORT });
    expect(typeof requests[0]?.body.portId).toBe("string");
  });

  test("a message posted before the port opened arrives after the connect", async () => {
    const requests = stubFetch(respondWithPortStream({}));

    const runtime = createShimmedRuntime();

    const port = (runtime.connect as Connect)();

    port.postMessage("first");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(requests.map(({ pathName }) => pathName)).toEqual([
      RUNTIME_PROXY_PATHS.connect,
      RUNTIME_PROXY_PATHS.portPost,
    ]);

    expect(requests[1]?.body).toMatchObject({ message: "first" });
  });

  test("a disconnect frame fires onDisconnect with the error on lastError", async () => {
    stubFetch(
      respondWithPortStream({
        enqueue: (controller) => {
          controller.enqueue(encodeFrame({ type: "disconnect", error: RECEIVING_END_ERROR }));
        },
      }),
    );

    const runtime = createShimmedRuntime();

    const port = (runtime.connect as Connect)();

    const lastErrorDuringListener = await new Promise<unknown>((resolve) => {
      port.onDisconnect.addListener(() => {
        resolve(runtime.lastError);
      });
    });

    expect(lastErrorDuringListener).toEqual({ message: RECEIVING_END_ERROR });
    expect(runtime.lastError).toBeUndefined();
  });

  test("a refused connect disconnects like a session with no worker", async () => {
    stubFetch(() => new Response(null, { status: 403 }));

    const runtime = createShimmedRuntime();

    const port = (runtime.connect as Connect)();

    const lastErrorDuringListener = await new Promise<unknown>((resolve) => {
      port.onDisconnect.addListener(() => {
        resolve(runtime.lastError);
      });
    });

    expect(lastErrorDuringListener).toEqual({ message: RECEIVING_END_ERROR });
  });

  test("disconnecting posts the disconnect and stays quiet locally", async () => {
    const requests = stubFetch(respondWithPortStream({}));

    const runtime = createShimmedRuntime();

    const port = (runtime.connect as Connect)();

    let disconnectHeard = false;

    port.onDisconnect.addListener(() => {
      disconnectHeard = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    port.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(disconnectHeard).toBe(false);
    expect(requests.some(({ pathName }) => pathName === RUNTIME_PROXY_PATHS.portDisconnect)).toBe(
      true,
    );

    expect(() => port.postMessage("too late")).toThrow(
      "Attempting to use a disconnected port object",
    );
  });

  test("a message posted before a disconnect goes out ahead of it, and the reader is canceled after", async () => {
    const events: string[] = [];

    let answerConnect = () => {};

    // The connect is held unanswered, which is the window an unchained
    // disconnect overtakes it in. A stub that answers in the same tick closes
    // that window and would pass whether the disconnect waits on `opened` or
    // resolves it itself
    const connectAnswered = new Promise<void>((resolve) => {
      answerConnect = resolve;
    });

    stubFetch(async (pathName) => {
      events.push(`request:${pathName}`);

      if (pathName !== RUNTIME_PROXY_PATHS.connect) {
        return new Response(null, { status: 204 });
      }

      await connectAnswered;

      const stream = new ReadableStream<Uint8Array>({
        cancel: () => {
          events.push("cancel");
        },
      });

      return new Response(stream, { status: 200 });
    });

    const runtime = createShimmedRuntime();

    const port = (runtime.connect as Connect)();

    port.postMessage("first");

    port.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events).toEqual([`request:${RUNTIME_PROXY_PATHS.connect}`]);

    answerConnect();

    await waitFor(() => events.includes("cancel"), "the reader cancel");

    expect(events).toEqual([
      `request:${RUNTIME_PROXY_PATHS.connect}`,
      `request:${RUNTIME_PROXY_PATHS.portPost}`,
      `request:${RUNTIME_PROXY_PATHS.portDisconnect}`,
      "cancel",
    ]);
  });

  test("a port the content script disconnected hears no more messages", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

    stubFetch(
      respondWithPortStream({
        enqueue: (controller) => {
          streamController = controller;
        },
      }),
    );

    const runtime = createShimmedRuntime();

    const port = (runtime.connect as Connect)();

    let messagesHeard = 0;

    port.onMessage.addListener(() => {
      messagesHeard += 1;
    });

    await waitFor(() => streamController !== undefined, "the port stream");

    port.disconnect();

    // Still on its way when the content script hung up, the way the worker's
    // last messages are
    streamController?.enqueue(encodeFrame({ type: "message", message: "late" }));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(messagesHeard).toBe(0);
  });

  test("a refused post tears the port down and tells the relay", async () => {
    const respondWithStream = respondWithPortStream({});

    const refusals = new Map<string, number>();

    const requests = stubFetch((pathName) => {
      const refusalStatus = refusals.get(pathName);

      // What a session already at its cap of bodies read at once answers
      return refusalStatus === undefined
        ? respondWithStream(pathName)
        : new Response(null, { status: refusalStatus });
    });

    const runtime = createShimmedRuntime();

    const port = (runtime.connect as Connect)();

    let lastErrorDuringListener: unknown;

    port.onDisconnect.addListener(() => {
      lastErrorDuringListener = runtime.lastError;
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    refusals.set(RUNTIME_PROXY_PATHS.portPost, 429);

    port.postMessage("refused");

    await waitFor(
      () => requests.some(({ pathName }) => pathName === RUNTIME_PROXY_PATHS.portDisconnect),
      "the disconnect post",
    );

    expect(lastErrorDuringListener).toEqual({ message: "The runtime proxy bridge answered 429" });
    expect(runtime.lastError).toBeUndefined();

    expect(requests.map(({ pathName }) => pathName)).toEqual([
      RUNTIME_PROXY_PATHS.connect,
      RUNTIME_PROXY_PATHS.portPost,
      RUNTIME_PROXY_PATHS.portDisconnect,
    ]);

    expect(() => port.postMessage("too late")).toThrow(
      "Attempting to use a disconnected port object",
    );
  });

  test("hands a connect aimed at another extension to the native method", () => {
    stubFetch(() => new Response(null, { status: 204 }));

    const nativeCalls: unknown[][] = [];

    const runtime = createShimmedRuntime({
      connect: (...callArguments: unknown[]) => {
        nativeCalls.push(callArguments);

        return { name: "native-port" };
      },
    });

    const port = (runtime.connect as Connect)(OTHER_EXTENSION_ID as unknown as object);

    expect(port.name).toBe("native-port");
    expect(nativeCalls).toEqual([[OTHER_EXTENSION_ID]]);
  });
});

describe("installRuntimeProxyShim", () => {
  test("shadows only sendMessage and connect, and leaves the rest native", () => {
    const nativeSendMessage = () => undefined;

    const getUrl = (resourcePath: string) => `chrome-extension://${EXTENSION_ID}/${resourcePath}`;

    const runtime: ChromeNamespace = {
      id: EXTENSION_ID,
      sendMessage: nativeSendMessage,
      getURL: getUrl,
    };

    installRuntimeProxyShim({ runtime });

    expect(runtime.sendMessage).not.toBe(nativeSendMessage);
    expect(runtime.getURL).toBe(getUrl);
    expect(runtime.id).toBe(EXTENSION_ID);
  });

  test("does nothing for an API object without a runtime", () => {
    const extensionApi: ChromeNamespace = {};

    installRuntimeProxyShim(extensionApi);

    expect(extensionApi.runtime).toBeUndefined();
  });
});
