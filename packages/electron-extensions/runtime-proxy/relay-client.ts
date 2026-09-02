import { postBridge } from "../facade/lib/bridge";
import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import { getLastErrorMessage, withLastError } from "../facade/lib/last-error";
import { NativeMessageDecoder } from "../native-messaging/framing";
import {
  MAX_RUNTIME_PROXY_FRAME_BYTES,
  PORT_CLOSED_ERROR,
  RECEIVING_END_ERROR,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyConnectResult,
  type RuntimeProxyJob,
  type RuntimeProxySender,
  type RuntimeProxySendMessageResult,
  type RuntimeProxyWorkerConnectToTabResult,
  type RuntimeProxyWorkerSendToTabResult,
} from "./bridge-protocol";
import { createCleanEndBackoff, DEFAULT_CLEAN_END_WINDOW_MS } from "./clean-end-backoff";
import { dispatchMessage, firstReply, mirrorEvent } from "./message-dispatch";
import { getNativeMethod, type NativeMethod, parseSendMessageArguments } from "./native-api";
import { createRelayedPort, type RelayedPort, type RelayedPortTransport } from "./relayed-port";
import {
  STORAGE_UNAVAILABLE_ERROR,
  type RuntimeProxyStorageCall,
  type RuntimeProxyStorageResult,
} from "./storage-protocol";

const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * How many job ids the client remembers to recognise a redelivery by. Far more
 * than a stream flap can put in flight at once, and bounded so a worker that
 * runs for hours does not grow a set for as long as it lives.
 */
const MAX_REMEMBERED_JOB_IDS = 1000;

/** What a refused bridge call reads as, whatever the call was. */
function bridgeAnsweredError(status: number) {
  return `The runtime proxy bridge answered ${status}`;
}

/** What the log lines of this side of the proxy are prefixed with. */
const LOG_LABEL = "runtime-proxy-relay";

export type CreateRelayClientOptions = {
  /** How long a job stream that failed waits before it is opened again. */
  retryDelayMs?: number;
  /** How long a job stream has to live for its clean end to count as ordinary. */
  cleanEndWindowMs?: number;
  /** How many handled job ids to remember before forgetting the oldest. */
  maxRememberedJobIds?: number;
  /**
   * How a relayed `chrome.storage` call is answered against this session's own
   * store (`storage-relay.ts`). Absent, storage calls are refused as an
   * unreachable store, which is what a worker built without one would mean.
   */
  runStorageCall?: (
    call: RuntimeProxyStorageCall,
    isTrustedContext: boolean,
  ) => Promise<RuntimeProxyStorageResult>;
};

/**
 * The worker-side half of the runtime proxy, run next to the extension's own
 * service worker in the one session that keeps it.
 *
 * It wraps `chrome.runtime.onMessage` and `onConnect` so it knows the listeners
 * the extension registered — native in-session dispatch keeps working, since
 * every listener is registered natively too — and keeps a job stream parked at
 * the bridge, through which the relay hands over what content scripts in the
 * other sessions sent. Each job is acked by id the moment it arrives, so a job
 * the worker died holding is told apart from one that never arrived, and
 * replies go back as bridge calls of their own. The parked stream does not pin
 * the worker: idle-stop happens as ever, and the relay wakes the worker when
 * the next job needs it.
 */
export function createRelayClient({
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  cleanEndWindowMs = DEFAULT_CLEAN_END_WINDOW_MS,
  maxRememberedJobIds = MAX_REMEMBERED_JOB_IDS,
  runStorageCall,
}: CreateRelayClientOptions = {}) {
  const messageListeners = new Set<ChromeEventListener>();

  const connectListeners = new Set<ChromeEventListener>();

  const ports = new Map<string, RelayedPort>();

  const handledJobIds = new Set<string>();

  const wrappedRuntimes: ChromeNamespace[] = [];

  let isStopped = false;

  const postToBridge = (pathName: string, body: Record<string, unknown>) =>
    postBridge(pathName, body).catch(() => undefined);

  /**
   * Where this worker is running, which main puts on the sender a shimmed
   * listener sees the way Chrome puts the service worker's script URL there.
   * Main takes it only when it is a URL of the extension the token named, so a
   * worker that cannot say has a sender without a `url` rather than a wrong one.
   */
  const workerUrl = (globalThis as unknown as { location?: { href?: string } }).location?.href;

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

  /** The transport a relayed port posts over: the bridge, both ways. */
  const createBridgeTransport = (portId: string): RelayedPortTransport => ({
    async post(message: unknown) {
      const response = await postBridge(RUNTIME_PROXY_PATHS.workerPortPost, { portId, message });

      if (!response.ok) {
        throw new Error(bridgeAnsweredError(response.status));
      }
    },
    disconnect() {
      return postToBridge(RUNTIME_PROXY_PATHS.workerPortDisconnect, { portId }).then(
        () => undefined,
      );
    },
  });

  /**
   * The worker's end of a port, whichever side opened it: a shimmed context's
   * `runtime.connect`, arriving as a job, or the worker's own `tabs.connect`,
   * whose `open` is what decides where the port's far end actually is.
   */
  const createPort = (
    portId: string,
    name: string | undefined,
    sender: RuntimeProxySender | undefined,
    open: () => Promise<RelayedPortTransport>,
  ) => {
    const port = createRelayedPort({
      name: name ?? "",
      sender,
      open,
      withRuntimesLastError,
      onClosed: () => {
        ports.delete(portId);
      },
    });

    ports.set(portId, port);

    return port;
  };

  /**
   * A reply the bridge cannot carry is still a reply: `postBridge` serializes
   * synchronously and throws on what `JSON.stringify` refuses — a `BigInt`, a
   * cycle, a `toJSON` of the extension's own that throws — and an escaping
   * throw would leave the caller waiting on the relay's in-flight timeout,
   * minutes away, where Chrome fails a `sendResponse` it cannot clone at once.
   */
  const postReply = (
    jobId: string,
    result: RuntimeProxySendMessageResult | RuntimeProxyConnectResult | RuntimeProxyStorageResult,
  ) => {
    try {
      return postToBridge(RUNTIME_PROXY_PATHS.workerReply, { jobId, result });
    } catch (error) {
      console.error("[runtime-proxy-relay] could not serialize the reply", error);

      // Neither a storage result nor a connect one, which is deliberate: main
      // maps what it cannot read for the job's kind onto that kind's own
      // failure, so a storage caller hears an unreachable store rather than a
      // closed message port it has no notion of
      return postToBridge(RUNTIME_PROXY_PATHS.workerReply, {
        jobId,
        result: { status: "closed" },
      });
    }
  };

  /**
   * Whether this job is new here. The relay redelivers anything it has no ack
   * for, and an ack can go missing on its own — `postToBridge` swallows a
   * failed POST — so a job this worker already ran can come back. Dispatching
   * it again would run the extension's listeners a second time, which for
   * anything that changes state is a double apply rather than a retry.
   */
  const isFirstDelivery = (jobId: string) => {
    if (handledJobIds.has(jobId)) {
      return false;
    }

    handledJobIds.add(jobId);

    if (handledJobIds.size > maxRememberedJobIds) {
      const oldestJobId = handledJobIds.values().next().value;

      if (oldestJobId !== undefined) {
        handledJobIds.delete(oldestJobId);
      }
    }

    return true;
  };

  const handleJob = (job: RuntimeProxyJob) => {
    if (typeof job?.jobId !== "string") {
      return;
    }

    // Acked first: the relay redelivers a job the worker died before taking,
    // and the ack is what says this one was taken. A redelivery is acked again
    // rather than ignored, since a lost ack is the reason it came back.
    void postToBridge(RUNTIME_PROXY_PATHS.workerAck, { jobId: job.jobId });

    if (!isFirstDelivery(job.jobId)) {
      return;
    }

    switch (job.type) {
      case "sendMessage": {
        void dispatchMessage(messageListeners, job.message, job.sender, LOG_LABEL).then((result) =>
          postReply(job.jobId, result),
        );

        break;
      }

      case "connect": {
        if (connectListeners.size === 0) {
          void postReply(job.jobId, { status: "noListener" });

          break;
        }

        const port = createPort(job.portId, job.name, job.sender, () =>
          Promise.resolve(createBridgeTransport(job.portId)),
        );

        void postReply(job.jobId, { status: "connected" });

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
        ports.get(job.portId)?.emitMessage(job.message);

        break;
      }

      case "storage": {
        void (
          runStorageCall?.(job.call, job.isTrustedContext) ??
          Promise.resolve<RuntimeProxyStorageResult>({
            status: "error",
            message: STORAGE_UNAVAILABLE_ERROR,
          })
        ).then((result) => postReply(job.jobId, result));

        break;
      }

      case "portDisconnect": {
        // The port drops itself from the map as it closes. An error means the
        // page-side end went away rather than hung up — nothing there to hand
        // the port to — which Chrome reports on `lastError`
        ports.get(job.portId)?.emitDisconnect(job.error);

        break;
      }
    }
  };

  const runJobStream = async () => {
    const cleanEndBackoff = createCleanEndBackoff({
      ceilingMs: retryDelayMs,
      windowMs: cleanEndWindowMs,
    });

    while (!isStopped) {
      const parkedAt = Date.now();

      let hasEndedCleanly = false;

      try {
        const response = await postBridge(RUNTIME_PROXY_PATHS.workerJobs, {});

        if (!response.ok || !response.body) {
          throw new Error(bridgeAnsweredError(response.status));
        }

        const reader = response.body.getReader();

        const decoder = new NativeMessageDecoder(MAX_RUNTIME_PROXY_FRAME_BYTES);

        for (;;) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          for (const job of decoder.push(value) as RuntimeProxyJob[]) {
            handleJob(job);
          }
        }

        hasEndedCleanly = true;
      } catch (error) {
        console.error(`[${LOG_LABEL}] job stream failed`, error);
      }

      if (isStopped) {
        return;
      }

      /*
       * A stream that ended cleanly is main having replaced it, which is what
       * its own invalidation looks like from here — every job queued behind
       * the replacement is waiting on this re-park, so sleeping on it is a
       * delay paid for nothing. Only a bridge that refused or broke is a
       * reason to wait, since re-parking on it at once would spin.
       */
      let delayMs: number;

      if (hasEndedCleanly) {
        delayMs = cleanEndBackoff.next(Date.now() - parkedAt);
      } else {
        cleanEndBackoff.reset();

        delayMs = retryDelayMs;
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  };

  /**
   * A native call made the way Chrome's callback form reports itself, so a
   * native outcome and a relayed one are the same three statuses. The callback
   * form rather than the promise form deliberately: `lastError` is what carries
   * "no receiving end" and "port closed", and it is only readable inside the
   * callback.
   */
  const callNative = (
    runtime: ChromeNamespace,
    nativeMethod: NativeMethod | undefined,
    callArguments: unknown[],
  ) =>
    new Promise<RuntimeProxySendMessageResult>((resolve) => {
      if (!nativeMethod) {
        resolve({ status: "noListener" });

        return;
      }

      try {
        nativeMethod(...callArguments, (reply: unknown) => {
          const error = getLastErrorMessage(runtime);

          if (error === undefined) {
            resolve({ status: "replied", reply });

            return;
          }

          resolve({ status: error === PORT_CLOSED_ERROR ? "closed" : "noListener" });
        });
      } catch {
        resolve({ status: "noListener" });
      }
    });

  /** A relayed call's answer, or a refused bridge read as no receiving end. */
  const postForResult = async <Result>(pathName: string, body: Record<string, unknown>) => {
    const response = await postBridge(pathName, body);

    if (!response.ok) {
      throw new Error(bridgeAnsweredError(response.status));
    }

    return (await response.json()) as Result;
  };

  /**
   * Hands the extension its answer the way it asked for one: a callback gets
   * the reply with `lastError` set around it when there was none, and a call
   * without one gets the promise Chrome's promise form returns, which rejects.
   */
  const answer = (
    runtime: ChromeNamespace,
    result: Promise<RuntimeProxySendMessageResult>,
    callback: ((reply: unknown) => void) | undefined,
  ) => {
    const reply = result.then((sendResult) => {
      if (sendResult.status === "replied") {
        return sendResult.reply;
      }

      throw new Error(sendResult.status === "closed" ? PORT_CLOSED_ERROR : RECEIVING_END_ERROR);
    });

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

  /**
   * `chrome.runtime.sendMessage` with no target extension: Chrome delivers it
   * to every frame of the extension except the sender, which here is both the
   * worker's own session — natively, where Chromium still does it — and the
   * extension's pages in every shimmed session, over their page streams. The
   * two run together and the first `sendResponse` wins, as it does between two
   * frames of one session.
   *
   * Content scripts are not included, in Chrome or here: a runtime broadcast
   * reaches the extension's own frames, and `tabs.sendMessage` is what reaches
   * a page's content scripts.
   */
  const createBroadcastingSendMessage =
    (runtime: ChromeNamespace, nativeSendMessage: NativeMethod | undefined) =>
    (...callArguments: unknown[]) => {
      const callback =
        typeof callArguments.at(-1) === "function"
          ? (callArguments.pop() as (reply: unknown) => void)
          : undefined;

      const { targetExtensionId, message } = parseSendMessageArguments(callArguments);

      // Another extension is none of the proxy's business, and neither is this
      // extension addressed by id, which is `externally_connectable` messaging
      if (targetExtensionId !== undefined) {
        return callback
          ? nativeSendMessage?.(...callArguments, callback)
          : nativeSendMessage?.(...callArguments);
      }

      const relayed = postForResult<RuntimeProxySendMessageResult>(
        RUNTIME_PROXY_PATHS.workerBroadcast,
        { message, workerUrl },
      ).catch((): RuntimeProxySendMessageResult => ({ status: "noListener" }));

      return answer(
        runtime,
        firstReply([callNative(runtime, nativeSendMessage, callArguments), relayed]),
        callback,
      );
    };

  /**
   * `chrome.tabs.sendMessage`, which natively reaches only the tabs of the
   * worker's own session. Every call is handed to the relay, which is the only
   * side that knows which session a tab id belongs to; a tab of the worker's
   * own session comes back as `ownSession` and is then sent natively after all.
   */
  const createProxiedTabsSendMessage =
    (runtime: ChromeNamespace, nativeSendMessage: NativeMethod | undefined) =>
    (...callArguments: unknown[]) => {
      const callback =
        typeof callArguments.at(-1) === "function"
          ? (callArguments.pop() as (reply: unknown) => void)
          : undefined;

      const [tabId, message, options] = callArguments as [
        number,
        unknown,
        { frameId?: number; documentId?: string } | undefined,
      ];

      const deliver = async (): Promise<RuntimeProxySendMessageResult> => {
        let result: RuntimeProxyWorkerSendToTabResult;

        try {
          result = await postForResult<RuntimeProxyWorkerSendToTabResult>(
            RUNTIME_PROXY_PATHS.workerSendToTab,
            {
              tabId,
              message,
              frameId: options?.frameId,
              documentId: options?.documentId,
              workerUrl,
            },
          );
        } catch {
          // An unreachable bridge reads exactly like a tab with no receiving end
          return { status: "noListener" };
        }

        if (result.status === "ownSession") {
          return callNative(runtime, nativeSendMessage, callArguments);
        }

        if (result.status === "noTarget") {
          throw new Error(result.error);
        }

        return result;
      };

      return answer(runtime, deliver(), callback);
    };

  /**
   * `chrome.tabs.connect`, routed the same way — except that a port must be
   * returned before the routing is known, so the port is handed back at once
   * and its `open` settles where its far end is: the relay, or a native port
   * to a tab of the worker's own session. Posts wait on that either way.
   */
  const createProxiedTabsConnect =
    (nativeConnect: NativeMethod | undefined) =>
    (tabId: number, connectInfo?: { name?: string; frameId?: number; documentId?: string }) => {
      const portId = crypto.randomUUID();

      const name = typeof connectInfo?.name === "string" ? connectInfo.name : "";

      const open = async (): Promise<RelayedPortTransport> => {
        const result = await postForResult<RuntimeProxyWorkerConnectToTabResult>(
          RUNTIME_PROXY_PATHS.workerConnectToTab,
          {
            portId,
            name,
            tabId,
            frameId: connectInfo?.frameId,
            documentId: connectInfo?.documentId,
            workerUrl,
          },
        );

        if (result.status === "connected") {
          return createBridgeTransport(portId);
        }

        if (result.status !== "ownSession") {
          // No such tab, or nothing of the extension listening in it, both of
          // which Chrome reports as a port that disconnects immediately
          throw new Error(result.status === "noTarget" ? result.error : RECEIVING_END_ERROR);
        }

        return createNativePortTransport(portId, nativeConnect, [tabId, connectInfo]);
      };

      return createPort(portId, name, undefined, open).externalPort;
    };

  /**
   * The far end of a `tabs.connect` that turned out to name a tab of the
   * worker's own session: the native port Chromium opened, wired so the port
   * the extension already holds carries its traffic.
   */
  const createNativePortTransport = (
    portId: string,
    nativeConnect: NativeMethod | undefined,
    connectArguments: unknown[],
  ): RelayedPortTransport => {
    const nativePort = nativeConnect?.(...connectArguments) as
      | {
          postMessage?: (message: unknown) => void;
          disconnect?: () => void;
          onMessage?: { addListener?: (listener: (message: unknown) => void) => void };
          onDisconnect?: { addListener?: (listener: () => void) => void };
        }
      | undefined;

    if (!nativePort) {
      throw new Error(RECEIVING_END_ERROR);
    }

    nativePort.onMessage?.addListener?.((message: unknown) => {
      ports.get(portId)?.emitMessage(message);
    });

    nativePort.onDisconnect?.addListener?.(() => {
      ports.get(portId)?.emitDisconnect();
    });

    return {
      post(message: unknown) {
        nativePort.postMessage?.(message);
      },
      disconnect() {
        nativePort.disconnect?.();
      },
    };
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

      runtime.sendMessage = createBroadcastingSendMessage(
        runtime,
        getNativeMethod(runtime, "sendMessage"),
      );
    },

    /**
     * Shadows `tabs.sendMessage` and `tabs.connect` of one extension API
     * object, which natively reach only the tabs of the worker's own session.
     * Everything else on `chrome.tabs` stays as Electron made it.
     */
    wrapTabs(extensionApi: ChromeNamespace) {
      const tabs = extensionApi.tabs as ChromeNamespace | undefined;

      if (!tabs) {
        return;
      }

      const runtime = extensionApi.runtime as ChromeNamespace | undefined;

      if (!runtime) {
        return;
      }

      tabs.sendMessage = createProxiedTabsSendMessage(
        runtime,
        getNativeMethod(tabs, "sendMessage"),
      );

      tabs.connect = createProxiedTabsConnect(getNativeMethod(tabs, "connect"));
    },

    /** Parks the job stream at the bridge, and keeps it parked. */
    start() {
      void runJobStream();
    },

    stop() {
      isStopped = true;
    },
  };
}
