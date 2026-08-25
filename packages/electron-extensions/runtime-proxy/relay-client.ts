import { postBridge } from "../facade/lib/bridge";
import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import { createEvent } from "../facade/lib/event";
import { NativeMessageDecoder } from "../native-messaging/framing";
import {
  MAX_RUNTIME_PROXY_FRAME_BYTES,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyConnectResult,
  type RuntimeProxyJob,
  type RuntimeProxySender,
  type RuntimeProxySendMessageResult,
} from "./bridge-protocol";

const DISCONNECTED_PORT_ERROR = "Attempting to use a disconnected port object";

const DEFAULT_RETRY_DELAY_MS = 1000;

type WorkerPort = {
  externalPort: Record<string, unknown>;
  emitMessage: (message: unknown) => void;
  emitDisconnect: () => void;
};

export type CreateRelayClientOptions = {
  /** How long a failed job stream waits before it is opened again. */
  retryDelayMs?: number;
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
}: CreateRelayClientOptions = {}) {
  const messageListeners = new Set<ChromeEventListener>();

  const connectListeners = new Set<ChromeEventListener>();

  const ports = new Map<string, WorkerPort>();

  let isStopped = false;

  const postToBridge = (pathName: string, body: Record<string, unknown>) =>
    postBridge(pathName, body).catch(() => undefined);

  /**
   * Wraps a native event with one that also mirrors its listeners here. The
   * native event keeps every listener too, so in-session messaging — the
   * worker's own popup, above all — dispatches exactly as before.
   */
  const mirrorEvent = (
    runtime: ChromeNamespace,
    eventName: string,
    mirroredListeners: Set<ChromeEventListener>,
  ) => {
    const nativeEvent = runtime[eventName] as
      | {
          addListener?: (listener: ChromeEventListener, ...eventOptions: unknown[]) => void;
          removeListener?: (listener: ChromeEventListener) => void;
          hasListener?: (listener: ChromeEventListener) => boolean;
          hasListeners?: () => boolean;
        }
      | undefined;

    const wrappedEvent = {
      addListener(listener: ChromeEventListener, ...eventOptions: unknown[]) {
        mirroredListeners.add(listener);

        nativeEvent?.addListener?.(listener, ...eventOptions);
      },
      removeListener(listener: ChromeEventListener) {
        mirroredListeners.delete(listener);

        nativeEvent?.removeListener?.(listener);
      },
      hasListener(listener: ChromeEventListener) {
        return mirroredListeners.has(listener);
      },
      hasListeners() {
        return mirroredListeners.size > 0;
      },
    };

    runtime[eventName] = wrappedEvent;

    if (runtime[eventName] !== wrappedEvent) {
      console.error(`[runtime-proxy-relay] could not wrap runtime.${eventName}`);
    }
  };

  /**
   * Chrome's dispatch, reproduced: every listener hears the message, the first
   * `sendResponse` wins, and a listener returning `true` keeps the channel
   * open for an answer that comes later. No listener at all is the "receiving
   * end does not exist" case, and listeners that all decline to answer close
   * the channel the way Chrome's message port closes.
   */
  const dispatchMessage = (
    message: unknown,
    sender: RuntimeProxySender,
  ): Promise<RuntimeProxySendMessageResult> => {
    if (messageListeners.size === 0) {
      return Promise.resolve({ status: "noListener" });
    }

    return new Promise((resolve) => {
      let isDone = false;

      let expectsAsyncResponse = false;

      const sendResponse = (response?: unknown) => {
        if (isDone) {
          return;
        }

        isDone = true;

        resolve({ status: "replied", reply: response });
      };

      for (const listener of messageListeners) {
        try {
          if (listener(message, sender, sendResponse) === true) {
            expectsAsyncResponse = true;
          }
        } catch (error) {
          console.error("[runtime-proxy-relay] onMessage listener threw", error);
        }
      }

      if (!isDone && !expectsAsyncResponse) {
        isDone = true;

        resolve({ status: "closed" });
      }
    });
  };

  const createWorkerPort = (
    portId: string,
    name: string | undefined,
    sender: RuntimeProxySender,
  ): WorkerPort => {
    const onMessage = createEvent();

    const onDisconnect = createEvent();

    let isDisconnected = false;

    let sendChain: Promise<unknown> = Promise.resolve();

    const externalPort: Record<string, unknown> = {
      name: name ?? "",
      sender,
      onMessage,
      onDisconnect,
      postMessage(message: unknown) {
        if (isDisconnected) {
          throw new Error(DISCONNECTED_PORT_ERROR);
        }

        // Chained so two posts arrive in the order they were written
        sendChain = sendChain
          .then(() => postBridge(RUNTIME_PROXY_PATHS.workerPortPost, { portId, message }))
          .catch(() => undefined);
      },
      disconnect() {
        if (isDisconnected) {
          return;
        }

        isDisconnected = true;

        ports.delete(portId);

        void postToBridge(RUNTIME_PROXY_PATHS.workerPortDisconnect, { portId });
      },
    };

    return {
      externalPort,
      emitMessage(message: unknown) {
        onMessage.emit(message, externalPort);
      },
      emitDisconnect() {
        if (isDisconnected) {
          return;
        }

        isDisconnected = true;

        onDisconnect.emit(externalPort);
      },
    };
  };

  const postReply = (
    jobId: string,
    result: RuntimeProxySendMessageResult | RuntimeProxyConnectResult,
  ) => postToBridge(RUNTIME_PROXY_PATHS.workerReply, { jobId, result });

  const handleJob = (job: RuntimeProxyJob) => {
    if (typeof job?.jobId !== "string") {
      return;
    }

    // Acked first: the relay redelivers a job the worker died before taking,
    // and the ack is what says this one was taken
    void postToBridge(RUNTIME_PROXY_PATHS.workerAck, { jobId: job.jobId });

    switch (job.type) {
      case "sendMessage": {
        void dispatchMessage(job.message, job.sender).then((result) =>
          postReply(job.jobId, result),
        );

        break;
      }

      case "connect": {
        if (connectListeners.size === 0) {
          void postReply(job.jobId, { status: "noListener" });

          break;
        }

        const port = createWorkerPort(job.portId, job.name, job.sender);

        ports.set(job.portId, port);

        void postReply(job.jobId, { status: "connected" });

        for (const listener of connectListeners) {
          try {
            listener(port.externalPort);
          } catch (error) {
            console.error("[runtime-proxy-relay] onConnect listener threw", error);
          }
        }

        break;
      }

      case "portMessage": {
        ports.get(job.portId)?.emitMessage(job.message);

        break;
      }

      case "portDisconnect": {
        const port = ports.get(job.portId);

        if (port) {
          ports.delete(job.portId);

          port.emitDisconnect();
        }

        break;
      }
    }
  };

  const runJobStream = async () => {
    while (!isStopped) {
      try {
        const response = await postBridge(RUNTIME_PROXY_PATHS.workerJobs, {});

        if (!response.ok || !response.body) {
          throw new Error(`The runtime proxy bridge answered ${response.status}`);
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
      } catch (error) {
        console.error("[runtime-proxy-relay] job stream failed", error);
      }

      if (!isStopped) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
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

      mirrorEvent(runtime, "onMessage", messageListeners);

      mirrorEvent(runtime, "onConnect", connectListeners);
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
