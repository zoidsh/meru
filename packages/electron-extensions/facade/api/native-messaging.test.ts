import { afterEach, describe, expect, test } from "bun:test";
import {
  NATIVE_MESSAGING_PATHS,
  type NativeMessagingFrame,
} from "../../native-messaging/bridge-protocol";
import { encodeNativeMessage } from "../../native-messaging/framing";
import type { ChromeNamespace } from "../lib/chrome";
import { installNativeMessaging } from "./native-messaging";

type NativeMessagingPort = {
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: { addListener: (listener: (message: unknown) => void) => void };
  onDisconnect: { addListener: (listener: () => void) => void };
};

type BridgeRequest = { path: string; body: Record<string, unknown> };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * The main-process end of the bridge, with the connect answer held back until
 * the test lets it through — which is what a real connect does while it looks
 * up the host manifest and spawns the host.
 */
function installFakeBridge() {
  const requests: BridgeRequest[] = [];

  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  let isStreamCanceled = false;

  let answerConnect = () => {};

  const refusals = new Map<string, number>();

  const connectAnswered = new Promise<void>((resolve) => {
    answerConnect = resolve;
  });

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const { pathname: path } = new URL(url);

    requests.push({ path, body: JSON.parse(init.body as string) });

    const refusalStatus = refusals.get(path);

    if (refusalStatus !== undefined) {
      return new Response(null, { status: refusalStatus });
    }

    if (path !== NATIVE_MESSAGING_PATHS.connect) {
      return new Response(null, { status: 204 });
    }

    await connectAnswered;

    const body = new ReadableStream<Uint8Array>({
      start: (streamController) => {
        controller = streamController;
      },
      cancel: () => {
        isStreamCanceled = true;
      },
    });

    return new Response(body);
  }) as unknown as typeof fetch;

  return {
    requests,
    paths: () => requests.map(({ path }) => path),
    answerConnect,
    refuse: (path: string, status: number) => {
      refusals.set(path, status);
    },
    sendFrame: (frame: NativeMessagingFrame) => {
      controller?.enqueue(encodeNativeMessage(frame));
    },
    isStreamCanceled: () => isStreamCanceled,
  };
}

function connectNative(hostName = "com.meru.test") {
  const runtime: ChromeNamespace = {};

  installNativeMessaging({ runtime });

  const connect = runtime.connectNative as (name: string) => NativeMessagingPort;

  return { runtime, port: connect(hostName) };
}

async function waitFor(description: string, isDone: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (isDone()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error(`Timed out waiting for ${description}`);
}

describe("facade connectNative", () => {
  test("sends the disconnect behind the connect and everything already posted", async () => {
    const bridge = installFakeBridge();

    const { port } = connectNative();

    port.postMessage({ hello: "host" });

    port.disconnect();

    // Nothing but the connect can have gone out while it is unanswered
    await waitFor("the connect request", () => bridge.paths().length > 0);

    expect(bridge.paths()).toEqual([NATIVE_MESSAGING_PATHS.connect]);

    bridge.answerConnect();

    await waitFor("the disconnect request", () => bridge.paths().length === 3);

    expect(bridge.paths()).toEqual([
      NATIVE_MESSAGING_PATHS.connect,
      NATIVE_MESSAGING_PATHS.post,
      NATIVE_MESSAGING_PATHS.disconnect,
    ]);

    expect(bridge.requests[1]?.body.message).toEqual({ hello: "host" });
  });

  test("cancels the stream once the disconnect has gone out", async () => {
    const bridge = installFakeBridge();

    const { port } = connectNative();

    port.disconnect();

    bridge.answerConnect();

    await waitFor("the stream cancel", () => bridge.isStreamCanceled());

    expect(bridge.paths()).toEqual([
      NATIVE_MESSAGING_PATHS.connect,
      NATIVE_MESSAGING_PATHS.disconnect,
    ]);
  });

  test("stays quiet about messages the host sent before the disconnect landed", async () => {
    const bridge = installFakeBridge();

    const { port } = connectNative();

    const messages: unknown[] = [];

    port.onMessage.addListener((message) => {
      messages.push(message);
    });

    let isDisconnectEmitted = false;

    port.onDisconnect.addListener(() => {
      isDisconnectEmitted = true;
    });

    bridge.answerConnect();

    await waitFor("the connect answer", () => bridge.paths().length > 0);

    bridge.sendFrame({ type: "message", message: { first: true } });

    await waitFor("the first message", () => messages.length === 1);

    port.disconnect();

    bridge.sendFrame({ type: "message", message: { second: true } });

    await waitFor("the stream cancel", () => bridge.isStreamCanceled());

    expect(messages).toEqual([{ first: true }]);

    // Chrome stays quiet about a port the extension disconnected itself
    expect(isDisconnectEmitted).toBe(false);
  });

  test("tears the port down when the bridge refuses a post", async () => {
    const bridge = installFakeBridge();

    const { runtime, port } = connectNative();

    let disconnectError: string | undefined;

    port.onDisconnect.addListener(() => {
      disconnectError = (runtime.lastError as { message?: string } | undefined)?.message;
    });

    bridge.answerConnect();

    // What a session already at its cap of bodies read at once answers
    bridge.refuse(NATIVE_MESSAGING_PATHS.post, 429);

    port.postMessage({ hello: "host" });

    await waitFor("the disconnect request", () =>
      bridge.paths().includes(NATIVE_MESSAGING_PATHS.disconnect),
    );

    expect(disconnectError).toBe("The native messaging bridge answered 429");

    // Main closed nothing, so the port's own disconnect is what closes its
    // record there and kills the host
    expect(bridge.paths()).toEqual([
      NATIVE_MESSAGING_PATHS.connect,
      NATIVE_MESSAGING_PATHS.post,
      NATIVE_MESSAGING_PATHS.disconnect,
    ]);

    expect(() => {
      port.postMessage({ hello: "again" });
    }).toThrow("Attempting to use a disconnected port object");

    await waitFor("the stream cancel", () => bridge.isStreamCanceled());
  });

  test("tears a port down once however many posts the bridge refuses", async () => {
    const bridge = installFakeBridge();

    const { port } = connectNative();

    let disconnectCount = 0;

    port.onDisconnect.addListener(() => {
      disconnectCount += 1;
    });

    bridge.answerConnect();

    bridge.refuse(NATIVE_MESSAGING_PATHS.post, 429);

    port.postMessage({ hello: "host" });

    port.postMessage({ hello: "again" });

    await waitFor("the disconnect request", () =>
      bridge.paths().includes(NATIVE_MESSAGING_PATHS.disconnect),
    );

    // The second post was queued before the first was refused, so it still
    // goes out, and the disconnect goes out behind it exactly once
    expect(bridge.paths()).toEqual([
      NATIVE_MESSAGING_PATHS.connect,
      NATIVE_MESSAGING_PATHS.post,
      NATIVE_MESSAGING_PATHS.post,
      NATIVE_MESSAGING_PATHS.disconnect,
    ]);

    expect(disconnectCount).toBe(1);
  });

  test("stays quiet about a post refused after the extension disconnected", async () => {
    const bridge = installFakeBridge();

    const { port } = connectNative();

    let isDisconnectEmitted = false;

    port.onDisconnect.addListener(() => {
      isDisconnectEmitted = true;
    });

    bridge.answerConnect();

    bridge.refuse(NATIVE_MESSAGING_PATHS.post, 429);

    port.postMessage({ hello: "host" });

    port.disconnect();

    await waitFor("the stream cancel", () => bridge.isStreamCanceled());

    expect(bridge.paths()).toEqual([
      NATIVE_MESSAGING_PATHS.connect,
      NATIVE_MESSAGING_PATHS.post,
      NATIVE_MESSAGING_PATHS.disconnect,
    ]);

    // Chrome stays quiet about a port the extension disconnected itself, and
    // the refusal arriving afterwards changes nothing
    expect(isDisconnectEmitted).toBe(false);
  });

  test("refuses to post on a disconnected port", () => {
    installFakeBridge();

    const { port } = connectNative();

    port.disconnect();

    expect(() => {
      port.postMessage({ hello: "host" });
    }).toThrow("Attempting to use a disconnected port object");
  });
});

describe("facade sendNativeMessage", () => {
  test("posts one message, answers the first reply and disconnects", async () => {
    const bridge = installFakeBridge();

    const runtime: ChromeNamespace = {};

    installNativeMessaging({ runtime });

    const sendNativeMessage = runtime.sendNativeMessage as (
      hostName: string,
      message: unknown,
    ) => Promise<unknown>;

    const reply = sendNativeMessage("com.meru.test", { hello: "host" });

    bridge.answerConnect();

    await waitFor("the posted message", () => bridge.paths().includes(NATIVE_MESSAGING_PATHS.post));

    bridge.sendFrame({ type: "message", message: { echo: { hello: "host" } } });

    expect(await reply).toEqual({ echo: { hello: "host" } });

    await waitFor("the stream cancel", () => bridge.isStreamCanceled());

    expect(bridge.paths()).toEqual([
      NATIVE_MESSAGING_PATHS.connect,
      NATIVE_MESSAGING_PATHS.post,
      NATIVE_MESSAGING_PATHS.disconnect,
    ]);
  });

  test("fails with the error the bridge disconnected with", async () => {
    const bridge = installFakeBridge();

    const runtime: ChromeNamespace = {};

    installNativeMessaging({ runtime });

    const sendNativeMessage = runtime.sendNativeMessage as (
      hostName: string,
      message: unknown,
    ) => Promise<unknown>;

    const reply = sendNativeMessage("com.meru.test", { hello: "host" });

    bridge.answerConnect();

    await waitFor("the posted message", () => bridge.paths().includes(NATIVE_MESSAGING_PATHS.post));

    bridge.sendFrame({ type: "disconnect", error: "Specified native messaging host not found." });

    await expect(reply).rejects.toThrow("Specified native messaging host not found.");
  });
});
