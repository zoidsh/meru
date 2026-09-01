import { isExtensionId } from "../derive/extension-id";
import { postBridge } from "../facade/lib/bridge";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { createEvent } from "../facade/lib/event";
import { withLastError } from "../facade/lib/last-error";
import { NativeMessageDecoder } from "../native-messaging/framing";
import {
  MAX_RUNTIME_PROXY_FRAME_BYTES,
  PORT_CLOSED_ERROR,
  RECEIVING_END_ERROR,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyPortFrame,
  type RuntimeProxySenderReport,
  type RuntimeProxySendMessageResult,
} from "./bridge-protocol";

const DISCONNECTED_PORT_ERROR = "Attempting to use a disconnected port object";

/** What a refused bridge call reads as, whatever the call was. */
function bridgeAnsweredError(status: number) {
  return `The runtime proxy bridge answered ${status}`;
}

/**
 * What a shimmed context can say about where it runs, read from its own
 * globals. The same two facts serve a content script and an extension page: the
 * main process holds the claim against the frame Chromium recorded as the
 * request's caller before anything trusts it, and reads a top-level document on
 * the extension's own scheme as the page it is.
 */
function getContextSenderReport(): RuntimeProxySenderReport {
  const contextGlobals = globalThis as unknown as {
    location?: { href?: string };
    self?: unknown;
    top?: unknown;
  };

  return {
    url: contextGlobals.location?.href ?? "",
    isTopFrame: contextGlobals.self === contextGlobals.top,
  };
}

export type ParsedSendMessageArguments = {
  targetExtensionId?: string;
  message: unknown;
};

/**
 * `sendMessage`'s optional leading extension id, told apart the way Chrome
 * tells it: three arguments make the first one the target, and with two the
 * first is a target only when it reads as an extension id. A 32-character
 * lowercase message with an options bag is misread the same way Chrome
 * misreads it.
 */
export function parseSendMessageArguments(callArguments: unknown[]): ParsedSendMessageArguments {
  if (callArguments.length >= 3) {
    return {
      targetExtensionId:
        typeof callArguments[0] === "string" ? (callArguments[0] as string) : undefined,
      message: callArguments[1],
    };
  }

  if (
    callArguments.length === 2 &&
    typeof callArguments[0] === "string" &&
    isExtensionId(callArguments[0])
  ) {
    return { targetExtensionId: callArguments[0], message: callArguments[1] };
  }

  return { message: callArguments[0] };
}

type NativeMethod = (...callArguments: unknown[]) => unknown;

function getNativeMethod(runtime: ChromeNamespace, name: string): NativeMethod | undefined {
  const method = runtime[name];

  return typeof method === "function" ? (method as NativeMethod).bind(runtime) : undefined;
}

function createProxiedSendMessage(
  runtime: ChromeNamespace,
  nativeSendMessage: NativeMethod | undefined,
  getSenderReport: () => RuntimeProxySenderReport,
) {
  return (...callArguments: unknown[]) => {
    const callback =
      typeof callArguments.at(-1) === "function"
        ? (callArguments.pop() as (reply: unknown) => void)
        : undefined;

    const { targetExtensionId, message } = parseSendMessageArguments(callArguments);

    // A message aimed at another extension is none of the proxy's business;
    // whatever Electron does with it natively is the right answer
    if (targetExtensionId !== undefined && targetExtensionId !== runtime.id && nativeSendMessage) {
      return callback
        ? nativeSendMessage(...callArguments, callback)
        : nativeSendMessage(...callArguments);
    }

    const deliver = async () => {
      let result: RuntimeProxySendMessageResult;

      try {
        const response = await postBridge(RUNTIME_PROXY_PATHS.sendMessage, {
          message,
          sender: getSenderReport(),
        });

        if (!response.ok) {
          throw new Error(bridgeAnsweredError(response.status));
        }

        result = (await response.json()) as RuntimeProxySendMessageResult;
      } catch {
        // An unreachable bridge reads exactly like a session with no worker
        throw new Error(RECEIVING_END_ERROR);
      }

      if (result?.status === "replied") {
        return result.reply;
      }

      throw new Error(result?.status === "closed" ? PORT_CLOSED_ERROR : RECEIVING_END_ERROR);
    };

    const reply = deliver();

    if (!callback) {
      return reply;
    }

    reply.then(
      (replyValue) => {
        callback(replyValue);
      },
      (error: Error) => {
        withLastError(runtime, error.message, () => {
          callback(undefined);
        });
      },
    );

    return undefined;
  };
}

function createProxiedPort(
  runtime: ChromeNamespace,
  name: string,
  getSenderReport: () => RuntimeProxySenderReport,
) {
  const portId = crypto.randomUUID();

  const onMessage = createEvent();

  const onDisconnect = createEvent();

  let isDisconnected = false;

  let markOpened = () => {};

  /**
   * Resolves once the bridge has answered the connect request. Everything
   * posted before that waits here, since two fetches have no order between
   * them and a message must never overtake the connect that opens its port.
   */
  const opened = new Promise<void>((resolve) => {
    markOpened = resolve;
  });

  let sendChain: Promise<unknown> = opened;

  const port = {
    name,
    onMessage,
    onDisconnect,
    postMessage(message: unknown) {
      if (isDisconnected) {
        throw new Error(DISCONNECTED_PORT_ERROR);
      }

      sendChain = sendChain
        .then(() => postBridge(RUNTIME_PROXY_PATHS.portPost, { portId, message }))
        .then((response) => {
          if (!response.ok) {
            refusePost(response.status);
          }
        })
        .catch(() => undefined);
    },
    disconnect() {
      if (isDisconnected) {
        return;
      }

      isDisconnected = true;

      markOpened();

      sendDisconnect();
    },
  };

  const sendDisconnect = () => {
    void postBridge(RUNTIME_PROXY_PATHS.portDisconnect, { portId });
  };

  // Chrome stays quiet about a port the content script disconnected itself
  const disconnected = (error?: string) => {
    markOpened();

    if (isDisconnected) {
      return;
    }

    isDisconnected = true;

    withLastError(runtime, error, () => {
      onDisconnect.emit(port);
    });
  };

  /**
   * A post the bridge refused, which is what a session at its cap of bodies
   * read at once gets. Chrome has no answer for one message being refused, so
   * this takes the nearest one it has: the port goes away with `lastError`
   * set, and everything posted after it throws. Main has closed nothing on its
   * side — the refusal is settled before the request reaches its handler — so
   * the disconnect still goes out to close the port's record there.
   */
  const refusePost = (status: number) => {
    if (isDisconnected) {
      return;
    }

    disconnected(bridgeAnsweredError(status));

    sendDisconnect();
  };

  const readFrames = async () => {
    const response = await postBridge(RUNTIME_PROXY_PATHS.connect, {
      portId,
      name,
      sender: getSenderReport(),
    });

    if (!response.ok || !response.body) {
      throw new Error(bridgeAnsweredError(response.status));
    }

    markOpened();

    const reader = response.body.getReader();

    const decoder = new NativeMessageDecoder(MAX_RUNTIME_PROXY_FRAME_BYTES);

    for (;;) {
      const { value, done } = await reader.read();

      if (done) {
        return;
      }

      for (const frame of decoder.push(value) as RuntimeProxyPortFrame[]) {
        if (frame.type === "message") {
          onMessage.emit(frame.message, port);
        } else {
          disconnected(frame.error);

          return;
        }
      }
    }
  };

  readFrames().then(
    () => {
      // The relay closed the stream without a disconnect frame: the far end
      // went away cleanly, which Chrome reports without an error
      disconnected();
    },
    () => {
      // Never opened, exactly like a session with no worker to receive it
      disconnected(RECEIVING_END_ERROR);
    },
  );

  return port;
}

function createProxiedConnect(
  runtime: ChromeNamespace,
  nativeConnect: NativeMethod | undefined,
  getSenderReport: () => RuntimeProxySenderReport,
) {
  return (...callArguments: unknown[]) => {
    const targetExtensionId = typeof callArguments[0] === "string" ? callArguments[0] : undefined;

    if (targetExtensionId !== undefined && targetExtensionId !== runtime.id && nativeConnect) {
      return nativeConnect(...callArguments);
    }

    const connectInfo = (
      typeof callArguments[0] === "object" && callArguments[0] !== null
        ? callArguments[0]
        : callArguments[1]
    ) as { name?: unknown } | undefined;

    return createProxiedPort(
      runtime,
      typeof connectInfo?.name === "string" ? connectInfo.name : "",
      getSenderReport,
    );
  };
}

export type InstallRuntimeProxyShimOptions = {
  getSenderReport?: () => RuntimeProxySenderReport;
};

/**
 * Shadows `chrome.runtime.sendMessage` and `chrome.runtime.connect` in a
 * context of a content-script-only session, pointing both at the runtime proxy
 * instead of at this session's own extension instance, which has no service
 * worker to receive them. It runs before any of the extension's own code — the
 * derive prepends it to every `content_scripts` entry and writes it into every
 * extension page ahead of the page's own scripts — so the extension only ever
 * sees the shadowed functions. Everything else on `chrome.runtime`, `getURL`
 * and `id` above all, stays exactly as Electron made it.
 *
 * `onMessage` and `onConnect` are left native, which is what bounds the shim:
 * an extension page hears what it opened a port for, and not what the worker
 * broadcasts with `sendMessage` to a session it isn't in.
 */
export function installRuntimeProxyShim(
  extensionApi: ChromeNamespace,
  { getSenderReport = getContextSenderReport }: InstallRuntimeProxyShimOptions = {},
) {
  const runtime = extensionApi.runtime as ChromeNamespace | undefined;

  if (!runtime) {
    return;
  }

  runtime.sendMessage = createProxiedSendMessage(
    runtime,
    getNativeMethod(runtime, "sendMessage"),
    getSenderReport,
  );

  runtime.connect = createProxiedConnect(
    runtime,
    getNativeMethod(runtime, "connect"),
    getSenderReport,
  );
}
