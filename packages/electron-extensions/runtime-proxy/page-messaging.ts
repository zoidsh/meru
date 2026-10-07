import { postBridge } from "../facade/lib/bridge";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { getLastErrorMessage } from "../facade/lib/last-error";
import { createBridgedMethod } from "../facade/lib/method";
import {
  PORT_CLOSED_ERROR,
  RECEIVING_END_ERROR,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyWorkerConnectToTabResult,
  type RuntimeProxyWorkerSendToTabResult,
} from "./bridge-protocol";
import { getNativeMethod, type NativeMethod } from "./native-api";
import { createPageStreamClient } from "./page-stream-client";
import type { RelayedPort, RelayedPortTransport } from "./relayed-port";

type MessageOptions = { frameId?: number; documentId?: string } | null | undefined;

/**
 * `chrome.tabs.sendMessage` and `tabs.connect` for an extension page in the
 * worker's session, and the content scripts' `runtime.sendMessage` reaching it,
 * all of which Chromium keeps inside the session it was called in — and no
 * account's tab is in this one.
 *
 * Bitwarden's popup in one of the embedder's windows fills by sending
 * `collectPageDetails` into the account's tab and gathering what each frame's
 * content script sends back on `runtime.onMessage`, then sending the fill into
 * the frame that answered. Both legs cross sessions, so both go through main:
 * the calls the way the worker's own do (`relay-client.ts`), and what the
 * content scripts send over a page stream this page parks, the one a shimmed
 * context parks (`page-stream-client.ts`).
 *
 * Only for an extension that opens windows: every other keeps Electron's own
 * messaging, which is what it has always had.
 */
export function proxyPageMessaging(extensionApi: ChromeNamespace) {
  const tabs = extensionApi.tabs as ChromeNamespace | undefined;

  const runtime = extensionApi.runtime as ChromeNamespace | undefined;

  if (!tabs || !runtime) {
    return undefined;
  }

  const pageGlobals = globalThis as unknown as { location: { href: string } };

  const client = createPageStreamClient({
    getSenderReport: () => ({ url: pageGlobals.location.href, isTopFrame: true }),
  });

  client.wrapRuntime(extensionApi);

  tabs.sendMessage = createPageTabsSendMessage(runtime, getNativeMethod(tabs, "sendMessage"));

  const nativeConnect = getNativeMethod(tabs, "connect");

  tabs.connect = (
    tabId: number,
    connectInfo?: { name?: string; frameId?: number; documentId?: string },
  ) => {
    const name = typeof connectInfo?.name === "string" ? connectInfo.name : "";

    return client.openPort(name, async (contextId, portId, relayedPort) => {
      const response = await postBridge(RUNTIME_PROXY_PATHS.workerConnectToTab, {
        portId,
        name,
        tabId,
        frameId: connectInfo?.frameId,
        documentId: connectInfo?.documentId,
        workerUrl: pageGlobals.location.href,
        contextId,
      });

      if (!response.ok) {
        throw new Error(RECEIVING_END_ERROR);
      }

      const result = (await response.json()) as RuntimeProxyWorkerConnectToTabResult;

      if (result.status === "connected") {
        return {
          async post(message: unknown) {
            const posted = await postBridge(RUNTIME_PROXY_PATHS.workerPortPost, {
              portId,
              message,
            });

            if (!posted.ok) {
              throw new Error(PORT_CLOSED_ERROR);
            }
          },
          async disconnect() {
            await postBridge(RUNTIME_PROXY_PATHS.workerPortDisconnect, { portId }).catch(
              () => undefined,
            );
          },
        };
      }

      if (result.status === "ownSession") {
        return wrapNativePort(nativeConnect?.(tabId, connectInfo), relayedPort);
      }

      throw new Error(result.status === "noTarget" ? result.error : RECEIVING_END_ERROR);
    });
  };

  client.start();

  return client;
}

/**
 * Answered from main, and natively for a tab of the worker's own session —
 * another extension page — which main names `ownSession` rather than relaying.
 */
function createPageTabsSendMessage(
  runtime: ChromeNamespace,
  nativeSendMessage: NativeMethod | undefined,
) {
  const pageGlobals = globalThis as unknown as { location: { href: string } };

  return createBridgedMethod(async (callArguments) => {
    const [tabId, message, options] = callArguments as [number, unknown, MessageOptions];

    let result: RuntimeProxyWorkerSendToTabResult;

    try {
      const response = await postBridge(RUNTIME_PROXY_PATHS.workerSendToTab, {
        tabId,
        message,
        frameId: options?.frameId,
        documentId: options?.documentId,
        workerUrl: pageGlobals.location.href,
      });

      if (!response.ok) {
        throw new Error(RECEIVING_END_ERROR);
      }

      result = (await response.json()) as RuntimeProxyWorkerSendToTabResult;
    } catch {
      // An unreachable bridge reads exactly like a tab with no receiving end
      throw new Error(RECEIVING_END_ERROR);
    }

    if (result.status === "ownSession") {
      return sendNatively(runtime, nativeSendMessage, callArguments);
    }

    if (result.status === "noTarget") {
      throw new Error(result.error);
    }

    if (result.status === "replied") {
      return result.reply;
    }

    throw new Error(result.status === "closed" ? PORT_CLOSED_ERROR : RECEIVING_END_ERROR);
  });
}

function sendNatively(
  runtime: ChromeNamespace,
  nativeSendMessage: NativeMethod | undefined,
  callArguments: unknown[],
) {
  return new Promise((resolve, reject) => {
    if (!nativeSendMessage) {
      reject(new Error(RECEIVING_END_ERROR));

      return;
    }

    nativeSendMessage(...callArguments, (reply: unknown) => {
      const error = getLastErrorMessage(runtime);

      if (error === undefined) {
        resolve(reply);
      } else {
        reject(new Error(error));
      }
    });
  });
}

type NativePort = {
  postMessage?: (message: unknown) => void;
  disconnect?: () => void;
  onMessage?: { addListener?: (listener: (message: unknown) => void) => void };
  onDisconnect?: { addListener?: (listener: () => void) => void };
};

/**
 * The native port Chromium opened to a tab of the worker's own session, wired
 * so the port the page already holds carries its traffic.
 */
function wrapNativePort(nativePort: unknown, relayedPort: RelayedPort): RelayedPortTransport {
  const port = nativePort as NativePort | undefined;

  if (!port) {
    throw new Error(RECEIVING_END_ERROR);
  }

  port.onMessage?.addListener?.((message) => {
    relayedPort.emitMessage(message);
  });

  port.onDisconnect?.addListener?.(() => {
    relayedPort.emitDisconnect();
  });

  return {
    post(message: unknown) {
      port.postMessage?.(message);
    },
    disconnect() {
      port.disconnect?.();
    },
  };
}
