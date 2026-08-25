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

/**
 * What the content script can say about where it runs, read from the isolated
 * world's own globals. The main process checks the claim against the session's
 * frame tree before anything trusts it.
 */
function getContentScriptSenderReport(): RuntimeProxySenderReport {
  const contentScriptGlobals = globalThis as unknown as {
    location?: { href?: string };
    self?: unknown;
    top?: unknown;
  };

  return {
    url: contentScriptGlobals.location?.href ?? "",
    isTopFrame: contentScriptGlobals.self === contentScriptGlobals.top,
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
          throw new Error(`The runtime proxy bridge answered ${response.status}`);
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
        .catch(() => undefined);
    },
    disconnect() {
      if (isDisconnected) {
        return;
      }

      isDisconnected = true;

      markOpened();

      void postBridge(RUNTIME_PROXY_PATHS.portDisconnect, { portId });
    },
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

  const readFrames = async () => {
    const response = await postBridge(RUNTIME_PROXY_PATHS.connect, {
      portId,
      name,
      sender: getSenderReport(),
    });

    if (!response.ok || !response.body) {
      throw new Error(`The runtime proxy bridge answered ${response.status}`);
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
 * content script's isolated world, pointing both at the runtime proxy instead
 * of at this session's own extension instance, which has no service worker to
 * receive them. It runs before any of the extension's own content scripts —
 * the derive prepends it to every `content_scripts` entry — so the extension
 * only ever sees the shadowed functions. Everything else on `chrome.runtime`,
 * `getURL` and `id` above all, stays exactly as Electron made it.
 */
export function installRuntimeProxyShim(
  extensionApi: ChromeNamespace,
  { getSenderReport = getContentScriptSenderReport }: InstallRuntimeProxyShimOptions = {},
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
