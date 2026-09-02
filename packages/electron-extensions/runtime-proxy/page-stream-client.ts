import { postBridge } from "../facade/lib/bridge";
import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import { withLastError } from "../facade/lib/last-error";
import { NativeMessageDecoder } from "../native-messaging/framing";
import {
  MAX_RUNTIME_PROXY_FRAME_BYTES,
  type RuntimeProxyPageEnvelope,
  type RuntimeProxySenderReport,
  RUNTIME_PROXY_PATHS,
} from "./bridge-protocol";
import { dispatchMessage, mirrorEvent } from "./message-dispatch";
import { createRelayedPort, type RelayedPort, type RelayedPortTransport } from "./relayed-port";

const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Where the backoff stops. A shimmed session whose worker session was torn
 * down is refused every park, and there may be dozens of frames doing it: a
 * flat second between tries is permanent idle load in an app that is working
 * perfectly well without that account. Backing off keeps the recovery — a
 * session adopted as the worker later is picked up within half a minute — at
 * a cost that decays to nothing.
 */
const MAX_RETRY_DELAY_MS = 30_000;

/** What the log lines of this side of the proxy are prefixed with. */
const LOG_LABEL = "runtime-proxy-page-stream";

/** What a refused bridge call reads as, whatever the call was. */
function bridgeAnsweredError(status: number) {
  return `The runtime proxy bridge answered ${status}`;
}

export type CreatePageStreamClientOptions = {
  /** What this context can truthfully say about where it runs. */
  getSenderReport: () => RuntimeProxySenderReport;
  /** How long a failed stream waits before it is parked again. */
  retryDelayMs?: number;
  /** Where the backoff after repeated failures stops. */
  maxRetryDelayMs?: number;
};

/**
 * The receiving end of a shimmed context: the half of the shim that hears what
 * the worker starts, where the rest of the shim only ever calls out.
 *
 * It parks a streaming response at the bridge as the shim installs — the
 * page-side mirror of the worker's job stream — and everything the worker
 * addresses at this context arrives on it: a `tabs.sendMessage` or a
 * `runtime.sendMessage` broadcast, and the ports a `tabs.connect` opens. So it
 * has to know the listeners the extension registered, which it does the way the
 * worker's relay client does: `onMessage` and `onConnect` are wrapped and their
 * listeners mirrored, every one of them still registered natively too.
 *
 * The stream is parked whatever the extension listens for, and before it has
 * registered anything: it carries more than `runtime` messaging — `storage`'s
 * change events are meant to ride it — and a context that parked only once
 * something registered would be a switch shared between features that know
 * nothing about each other.
 */
export function createPageStreamClient({
  getSenderReport,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  maxRetryDelayMs = MAX_RETRY_DELAY_MS,
}: CreatePageStreamClientOptions) {
  const messageListeners = new Set<ChromeEventListener>();

  const connectListeners = new Set<ChromeEventListener>();

  const ports = new Map<string, RelayedPort>();

  const wrappedRuntimes: ChromeNamespace[] = [];

  /**
   * What the relay called this context when it parked, sent back on anything
   * this context says about itself — which end of a port bound to several
   * frames of a tab has hung up, above all.
   */
  let contextId: string | undefined;

  let isStopped = false;

  const postToBridge = (pathName: string, body: Record<string, unknown>) =>
    postBridge(pathName, body).catch(() => undefined);

  /**
   * `lastError` around an emit, set on every runtime object this client
   * wrapped: Electron builds `chrome` and `browser` as two objects, one client
   * serves both, and a listener reads whichever one it was written against.
   */
  const withRuntimesLastError = (error: string, emit: () => void) => {
    let run = emit;

    for (const runtime of wrappedRuntimes) {
      const nextRun = run;

      run = () => {
        withLastError(runtime, error, nextRun);
      };
    }

    run();
  };

  /**
   * This context's end of a port the worker opened. Its posts take the same
   * route a port this context opened itself takes, since the relay keeps both
   * kinds as one record and tells them apart by the transport, not the caller.
   */
  const createPort = (portId: string, name: string | undefined) => {
    const transport: RelayedPortTransport = {
      async post(message: unknown) {
        const response = await postBridge(RUNTIME_PROXY_PATHS.portPost, { portId, message });

        if (!response.ok) {
          throw new Error(bridgeAnsweredError(response.status));
        }
      },
      disconnect() {
        return postToBridge(RUNTIME_PROXY_PATHS.portDisconnect, { portId, contextId }).then(
          () => undefined,
        );
      },
    };

    return createRelayedPort({
      name: name ?? "",
      open: () => Promise.resolve(transport),
      withRuntimesLastError,
      onClosed: () => {
        ports.delete(portId);
      },
    });
  };

  const handleEnvelope = (envelope: RuntimeProxyPageEnvelope) => {
    switch (envelope.kind) {
      case "ready": {
        contextId = envelope.contextId;

        break;
      }

      case "message": {
        void dispatchMessage(messageListeners, envelope.message, envelope.sender, LOG_LABEL).then(
          (result) =>
            postToBridge(RUNTIME_PROXY_PATHS.pageReply, {
              deliveryId: envelope.deliveryId,
              result,
            }),
        );

        break;
      }

      case "connect": {
        const port = createPort(envelope.portId, envelope.name);

        port.externalPort.sender = envelope.sender;

        // Nothing here to hand the port to. Saying why is what puts Chrome's
        // "receiving end does not exist" on the worker's `lastError` when this
        // was the port's last frame; for a port bound to several it drops this
        // frame rather than the port
        if (connectListeners.size === 0) {
          void postToBridge(RUNTIME_PROXY_PATHS.portDisconnect, {
            portId: envelope.portId,
            contextId,
            reason: "noListener",
          });

          break;
        }

        ports.set(envelope.portId, port);

        for (const listener of connectListeners) {
          try {
            listener(port.externalPort);
          } catch (error) {
            console.error(`[${LOG_LABEL}] onConnect listener threw`, error);
          }
        }

        break;
      }

      case "portMessage": {
        ports.get(envelope.portId)?.emitMessage(envelope.message);

        break;
      }

      case "portDisconnect": {
        ports.get(envelope.portId)?.emitDisconnect(envelope.error);

        break;
      }
    }
  };

  /**
   * Parks the stream, and parks it again whenever it ends. A stream ends when
   * the relay drops this context — the worker's session went away and took the
   * relay's idea of this one with it — where the context itself is still very
   * much alive and still has to hear the worker that comes back.
   */
  const runPageStream = async () => {
    let failureCount = 0;

    while (!isStopped) {
      try {
        const response = await postBridge(RUNTIME_PROXY_PATHS.pageStream, {
          sender: getSenderReport(),
        });

        if (!response.ok || !response.body) {
          throw new Error(bridgeAnsweredError(response.status));
        }

        failureCount = 0;

        const reader = response.body.getReader();

        const decoder = new NativeMessageDecoder(MAX_RUNTIME_PROXY_FRAME_BYTES);

        for (;;) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          for (const envelope of decoder.push(value) as RuntimeProxyPageEnvelope[]) {
            handleEnvelope(envelope);
          }
        }
      } catch {
        // A refused or broken stream is a context that hears nothing until it
        // parks again, which is worth no more noise than the wait itself
        failureCount += 1;
      }

      if (!isStopped) {
        const delayMs = Math.min(
          retryDelayMs * 2 ** Math.max(failureCount - 1, 0),
          maxRetryDelayMs,
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  };

  return {
    /**
     * Wraps `runtime.onMessage` and `runtime.onConnect` of one extension API
     * object. Called for both `chrome` and `browser` — Electron builds them as
     * two objects — with the mirrored listeners shared between them.
     */
    wrapRuntime(extensionApi: ChromeNamespace) {
      const runtime = extensionApi.runtime as ChromeNamespace | undefined;

      if (!runtime) {
        return;
      }

      wrappedRuntimes.push(runtime);

      mirrorEvent(runtime, "onMessage", messageListeners, LOG_LABEL);

      mirrorEvent(runtime, "onConnect", connectListeners, LOG_LABEL);
    },

    /** Parks the receive stream at the bridge, and keeps it parked. */
    start() {
      void runPageStream();
    },

    stop() {
      isStopped = true;
    },
  };
}
