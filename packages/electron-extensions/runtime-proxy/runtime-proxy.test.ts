import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  OnBeforeSendHeadersListenerDetails,
  Session,
  WebContents,
  WebFrameMain,
} from "electron";
import { ExtensionBridge } from "../bridge/bridge";
import { getExtensionBridgeUrl } from "../bridge/protocol";
import { NativeMessageDecoder } from "../native-messaging/framing";
import {
  EXTENSION_SCHEME_PREFIX,
  PORT_CLOSED_ERROR,
  RECEIVING_END_ERROR,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyJob,
  type RuntimeProxyPortFrame,
} from "./bridge-protocol";
import { RuntimeProxy, type RuntimeProxyOptions } from "./runtime-proxy";
import {
  STORAGE_ACCESS_DENIED_ERROR,
  STORAGE_ACCESS_LEVEL_CONTEXT_ERROR,
  STORAGE_UNAVAILABLE_ERROR,
  type RuntimeProxyStorageCall,
} from "./storage-protocol";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const EXTENSION_SCOPE = `chrome-extension://${EXTENSION_ID}/`;

const WORKER_TOKEN = "worker-token";

const SHIM_TOKEN = "shim-token";

const PAGE_URL = "https://accounts.google.com/signin";

const SENDER_REPORT = { url: PAGE_URL, isTopFrame: true };

async function waitFor(condition: () => boolean, what: string) {
  const deadline = Date.now() + 1000;

  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

type StatusListener = (details: { versionId: number; runningStatus: string }) => void;

type BeforeSendHeadersListener = (
  details: OnBeforeSendHeadersListenerDetails,
  callback: (response: { requestHeaders?: Record<string, string> }) => void,
) => void;

function createFakeSession() {
  let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

  let beforeSendHeadersListener: BeforeSendHeadersListener | null = null;

  const statusListeners = new Set<StatusListener>();

  const scopesByVersionId = new Map<number, string>();

  const workerStarts: string[] = [];

  let failWorkerStart = false;

  const session = {
    protocol: {
      handle: (_scheme: string, handler: (request: GlobalRequest) => Promise<Response>) => {
        requestHandler = handler;
      },
      unhandle: () => {
        requestHandler = undefined;
      },
    },
    webRequest: {
      onBeforeSendHeaders: (
        filterOrListener: unknown,
        maybeListener?: BeforeSendHeadersListener | null,
      ) => {
        beforeSendHeadersListener =
          maybeListener === undefined
            ? (filterOrListener as BeforeSendHeadersListener | null)
            : maybeListener;
      },
    },
    serviceWorkers: {
      on: (_event: string, listener: StatusListener) => {
        statusListeners.add(listener);
      },
      removeListener: (_event: string, listener: StatusListener) => {
        statusListeners.delete(listener);
      },
      getInfoFromVersionID: (versionId: number) => {
        const scope = scopesByVersionId.get(versionId);

        if (scope === undefined) {
          throw new Error("Service worker is not running");
        }

        return { scope };
      },
      startWorkerForScope: (scope: string) => {
        workerStarts.push(scope);

        return failWorkerStart
          ? Promise.reject(new Error("Failed to start service worker"))
          : Promise.resolve({});
      },
    },
  } as unknown as Session;

  return {
    session,
    workerStarts,
    setFailWorkerStart: (fail: boolean) => {
      failWorkerStart = fail;
    },
    /** Registers the version's scope and reports the worker running. */
    reportWorkerRunning: (versionId: number, scope = EXTENSION_SCOPE) => {
      scopesByVersionId.set(versionId, scope);

      for (const listener of statusListeners) {
        listener({ versionId, runningStatus: "running" });
      }
    },
    reportWorkerStopping: (versionId: number) => {
      for (const listener of statusListeners) {
        listener({ versionId, runningStatus: "stopping" });
      }
    },
    /** The second half of a stop: Chromium reports both, in this order. */
    reportWorkerStopped: (versionId: number) => {
      scopesByVersionId.delete(versionId);

      for (const listener of statusListeners) {
        listener({ versionId, runningStatus: "stopped" });
      }
    },
    /**
     * Sends a request the way Electron carries one: the bridge's headers
     * listener runs first — recording `callerFrame` when the request has one,
     * the way Chromium names a fetch's initiator — and the handler receives
     * the request with whatever the listener stamped on it.
     */
    request: (
      pathName: string,
      bridgeToken: string,
      body: Record<string, unknown>,
      callerFrame?: WebFrameMain,
    ) => {
      const url = getExtensionBridgeUrl(pathName, bridgeToken);

      let requestHeaders: Record<string, string> = {};

      beforeSendHeadersListener?.(
        { url, frame: callerFrame ?? null, requestHeaders } as OnBeforeSendHeadersListenerDetails,
        ({ requestHeaders: stampedHeaders }) => {
          if (stampedHeaders) {
            requestHeaders = stampedHeaders;
          }
        },
      );

      return requestHandler?.(
        new Request(url, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify(body),
        }) as GlobalRequest,
      ) as Promise<Response>;
    },
  };
}

/** A page of the shim's session, its frame and the tab hosting it. */
function createPage(shimSession: Session, contentsId = 7, url = PAGE_URL) {
  const frame = {
    url,
    frameTreeNodeId: 12,
    parent: null,
    isDestroyed: () => false,
  } as unknown as WebFrameMain;

  const contents = {
    id: contentsId,
    session: shimSession,
    isDestroyed: () => false,
    isLoading: () => false,
    isCurrentlyAudible: () => false,
    getURL: () => url,
    getTitle: () => "Sign in",
  } as unknown as WebContents;

  return { frame, contents };
}

/**
 * `adoptWorkerSession: false` builds the proxy without one, the way a launch
 * looks between the routes being registered and the worker session being set
 * up; `adoptWorkerSession()` on the harness is that setup.
 */
function createHarness(
  proxyOptions: RuntimeProxyOptions = {},
  { adoptWorkerSession = true }: { adoptWorkerSession?: boolean } = {},
) {
  const workerSession = createFakeSession();

  const shimSession = createFakeSession();

  const bridge = new ExtensionBridge();

  bridge.setupSession(workerSession.session, {
    getExtensionId: (bridgeToken) => (bridgeToken === WORKER_TOKEN ? EXTENSION_ID : undefined),
  });

  bridge.setupSession(shimSession.session, {
    getExtensionId: (bridgeToken) => (bridgeToken === SHIM_TOKEN ? EXTENSION_ID : undefined),
  });

  const page = createPage(shimSession.session);

  const secondPage = createPage(shimSession.session, 8);

  const contentsByFrame = new Map([
    [page.frame, page.contents],
    [secondPage.frame, secondPage.contents],
  ]);

  const proxy = new RuntimeProxy({
    getWebContentsFromFrame: (frame) => contentsByFrame.get(frame),
    ...proxyOptions,
  });

  proxy.registerRoutes(bridge);

  if (adoptWorkerSession) {
    proxy.setWorkerSession(workerSession.session);
  }

  /** Parks a worker job stream the way the relay client does, collecting jobs. */
  const openWorkerStream = async () => {
    const response = await workerSession.request(RUNTIME_PROXY_PATHS.workerJobs, WORKER_TOKEN, {});

    expect(response.status).toBe(200);

    const jobs: RuntimeProxyJob[] = [];

    let isEnded = false;

    const reader = response.body?.getReader();

    void (async () => {
      const decoder = new NativeMessageDecoder();

      for (;;) {
        const result = await reader?.read();

        if (!result || result.done) {
          isEnded = true;

          return;
        }

        for (const job of decoder.push(result.value) as RuntimeProxyJob[]) {
          jobs.push(job);
        }
      }
    })();

    return {
      jobs,
      isEnded: () => isEnded,
      waitForJobs: async (jobCount: number) => {
        await waitFor(() => jobs.length >= jobCount, `${jobCount} jobs`);

        return jobs;
      },
    };
  };

  const ackJob = (jobId: string) =>
    workerSession.request(RUNTIME_PROXY_PATHS.workerAck, WORKER_TOKEN, { jobId });

  const replyToJob = (jobId: string, result: Record<string, unknown>) =>
    workerSession.request(RUNTIME_PROXY_PATHS.workerReply, WORKER_TOKEN, { jobId, result });

  /** `null` sends the way a frameless caller would; omitted, the page calls. */
  const sendShimMessage = (message: unknown, callerFrame: WebFrameMain | null = page.frame) =>
    shimSession.request(
      RUNTIME_PROXY_PATHS.sendMessage,
      SHIM_TOKEN,
      {
        message,
        sender: SENDER_REPORT,
      },
      callerFrame ?? undefined,
    );

  /** Opens a shim port and collects the frames streamed back to it. */
  const connectShimPort = async (portId: string, name = "relay") => {
    const response = await shimSession.request(
      RUNTIME_PROXY_PATHS.connect,
      SHIM_TOKEN,
      {
        portId,
        name,
        sender: SENDER_REPORT,
      },
      page.frame,
    );

    expect(response.status).toBe(200);

    const frames: RuntimeProxyPortFrame[] = [];

    const reader = response.body?.getReader();

    void (async () => {
      const decoder = new NativeMessageDecoder();

      for (;;) {
        const result = await reader?.read();

        if (!result || result.done) {
          return;
        }

        for (const frame of decoder.push(result.value) as RuntimeProxyPortFrame[]) {
          frames.push(frame);
        }
      }
    })();

    return {
      frames,
      waitForFrames: async (frameCount: number) => {
        await waitFor(() => frames.length >= frameCount, `${frameCount} port frames`);

        return frames;
      },
    };
  };

  return {
    proxy,
    workerSession,
    shimSession,
    page,
    secondPage,
    openWorkerStream,
    ackJob,
    replyToJob,
    sendShimMessage,
    connectShimPort,
    adoptWorkerSession: () => {
      proxy.setWorkerSession(workerSession.session);
    },
  };
}

describe("RuntimeProxy", () => {
  test("Electron still ships the experimental APIs the proxy stands on", async () => {
    // `startWorkerForScope` and `running-status-changed` are marked
    // experimental on Electron 43. This pin fails the moment an upgrade drops
    // either, before a runtime ever does.
    const electronTypes = await readFile(
      path.join(path.dirname(require.resolve("electron")), "electron.d.ts"),
      "utf8",
    );

    expect(electronTypes).toContain("startWorkerForScope(scope: string)");
    expect(electronTypes).toContain("'running-status-changed'");
  });

  test("relays a message to the parked stream and its reply back, sender rebuilt", async () => {
    const harness = createHarness();

    const workerStream = await harness.openWorkerStream();

    const shimResponse = harness.sendShimMessage({ kind: "unlock" });

    const [job] = await workerStream.waitForJobs(1);

    if (job?.type !== "sendMessage") {
      throw new Error("Expected a sendMessage job");
    }

    expect(job.message).toEqual({ kind: "unlock" });
    expect(job.sender.id).toBe(EXTENSION_ID);
    expect(job.sender.url).toBe(PAGE_URL);
    expect(job.sender.frameId).toBe(0);
    expect(job.sender.tab?.id).toBe(7);
    expect(job.sender.tab?.title).toBe("Sign in");

    await harness.ackJob(job.jobId);

    await harness.replyToJob(job.jobId, { status: "replied", reply: { unlocked: true } });

    const response = await shimResponse;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "replied", reply: { unlocked: true } });
  });

  test("two tabs on one URL: the sender is the tab that called, not the first match", async () => {
    const harness = createHarness();

    const workerStream = await harness.openWorkerStream();

    // Both pages sit at PAGE_URL; the message goes out from the second one
    const shimResponse = harness.sendShimMessage("which tab am I?", harness.secondPage.frame);

    const [job] = await workerStream.waitForJobs(1);

    if (job?.type !== "sendMessage") {
      throw new Error("Expected a sendMessage job");
    }

    expect(job.sender.tab?.id).toBe(8);

    await harness.ackJob(job.jobId);

    await harness.replyToJob(job.jobId, { status: "replied" });

    await shimResponse;
  });

  test("a report the caller's own frame does not back delivers the id alone", async () => {
    const harness = createHarness();

    const workerStream = await harness.openWorkerStream();

    // The stamped caller is a service worker's frameless request, so nothing
    // the report claims has backing
    const shimResponse = harness.sendShimMessage("trust me", null);

    const [job] = await workerStream.waitForJobs(1);

    if (job?.type !== "sendMessage") {
      throw new Error("Expected a sendMessage job");
    }

    expect(job.sender).toEqual({ id: EXTENSION_ID });

    await harness.ackJob(job.jobId);

    await harness.replyToJob(job.jobId, { status: "replied" });

    await shimResponse;
  });

  test("wakes a stopped worker and hands the job to the stream that follows", async () => {
    const harness = createHarness();

    const shimResponse = harness.sendShimMessage("wake up");

    await waitFor(() => harness.workerSession.workerStarts.length === 1, "the wake");

    expect(harness.workerSession.workerStarts).toEqual([EXTENSION_SCOPE]);

    const workerStream = await harness.openWorkerStream();

    const [job] = await workerStream.waitForJobs(1);

    if (job?.type !== "sendMessage") {
      throw new Error("Expected a sendMessage job");
    }

    await harness.ackJob(job.jobId);

    await harness.replyToJob(job.jobId, { status: "replied", reply: "awake" });

    expect(await (await shimResponse).json()).toEqual({ status: "replied", reply: "awake" });
  });

  test("passes the worker's noListener answer through to the shim", async () => {
    const harness = createHarness();

    const workerStream = await harness.openWorkerStream();

    const shimResponse = harness.sendShimMessage("anyone there?");

    const [job] = await workerStream.waitForJobs(1);

    if (job?.type !== "sendMessage") {
      throw new Error("Expected a sendMessage job");
    }

    await harness.ackJob(job.jobId);

    await harness.replyToJob(job.jobId, { status: "noListener" });

    expect(await (await shimResponse).json()).toEqual({ status: "noListener" });
  });

  test("a worker stop redelivers the un-acked and fails the acked", async () => {
    const harness = createHarness();

    harness.workerSession.reportWorkerRunning(1);

    const firstStream = await harness.openWorkerStream();

    const unackedResponse = harness.sendShimMessage("never acked");

    const ackedResponse = harness.sendShimMessage("acked, never answered");

    const [firstJob, secondJob] = await firstStream.waitForJobs(2);

    if (firstJob?.type !== "sendMessage" || secondJob?.type !== "sendMessage") {
      throw new Error("Expected two sendMessage jobs");
    }

    await harness.ackJob(secondJob.jobId);

    harness.workerSession.reportWorkerStopping(1);

    // The acked job died with the worker that took it: Chrome's closed port
    expect(await (await ackedResponse).json()).toEqual({ status: "closed" });

    await waitFor(() => firstStream.isEnded(), "the parked stream to be invalidated");

    // The un-acked job is handed again to the next stream, same job id
    await waitFor(() => harness.workerSession.workerStarts.length >= 1, "the re-wake");

    const secondStream = await harness.openWorkerStream();

    const [redeliveredJob] = await secondStream.waitForJobs(1);

    if (redeliveredJob?.type !== "sendMessage") {
      throw new Error("Expected the redelivered sendMessage job");
    }

    expect(redeliveredJob.jobId).toBe(firstJob.jobId);
    expect(redeliveredJob.message).toBe("never acked");

    await harness.ackJob(redeliveredJob.jobId);

    await harness.replyToJob(redeliveredJob.jobId, { status: "replied", reply: "finally" });

    expect(await (await unackedResponse).json()).toEqual({ status: "replied", reply: "finally" });
  });

  /*
   * A worker that crashes, is killed, or is taken by the out-of-memory killer
   * may never make its session report it stopped, and the request's own abort
   * signal never fires — so without a backstop the job stays in flight and the
   * shim's `sendMessage`, whose response is held open until the job settles,
   * neither resolves nor rejects.
   */
  test("a worker that dies without a word ends its acked job as a closed port", async () => {
    const harness = createHarness({ inFlightTimeoutMs: 20 });

    const workerStream = await harness.openWorkerStream();

    const shimResponse = harness.sendShimMessage({ kind: "unlock" });

    const [job] = await workerStream.waitForJobs(1);

    await harness.ackJob(job?.jobId as string);

    // Nothing more from the worker: no reply, and no stopping event either
    const response = await shimResponse;

    expect(await response.json()).toEqual({ status: "closed" });
  });

  test("a job the worker never acked ends as a missing receiving end", async () => {
    const harness = createHarness({ inFlightTimeoutMs: 20 });

    const workerStream = await harness.openWorkerStream();

    const shimResponse = harness.sendShimMessage({ kind: "unlock" });

    await workerStream.waitForJobs(1);

    const response = await shimResponse;

    expect(await response.json()).toEqual({ status: "noListener" });
  });

  test("a worker that answers in time is not cut off by the backstop", async () => {
    const harness = createHarness({ inFlightTimeoutMs: 50 });

    const workerStream = await harness.openWorkerStream();

    const shimResponse = harness.sendShimMessage({ kind: "unlock" });

    const [job] = await workerStream.waitForJobs(1);

    await harness.ackJob(job?.jobId as string);

    await harness.replyToJob(job?.jobId as string, { status: "replied", reply: "unlocked" });

    expect(await (await shimResponse).json()).toEqual({ status: "replied", reply: "unlocked" });
  });

  test("a job past its delivery attempts fails instead of chasing the worker", async () => {
    const harness = createHarness({ maxDeliveryAttempts: 1 });

    harness.workerSession.reportWorkerRunning(1);

    const workerStream = await harness.openWorkerStream();

    const shimResponse = harness.sendShimMessage("lost");

    await workerStream.waitForJobs(1);

    harness.workerSession.reportWorkerStopping(1);

    expect(await (await shimResponse).json()).toEqual({ status: "noListener" });
  });

  test("a wake that fails before the first registration hands its jobs to the worker that arrives", async () => {
    const harness = createHarness();

    // Chromium rejects `startWorkerForScope` while the scope has no stored
    // registration — the app's first moments, before the worker session has
    // finished loading its copy of the extension
    harness.workerSession.setFailWorkerStart(true);

    const shimResponse = harness.sendShimMessage("sent before the worker registered");

    await waitFor(() => harness.workerSession.workerStarts.length === 1, "the wake attempt");

    // The freshly registered worker parks its stream, exactly as the relay
    // client does on its first start, and the job is waiting for it
    const workerStream = await harness.openWorkerStream();

    const [job] = await workerStream.waitForJobs(1);

    await harness.ackJob(job?.jobId as string);

    await harness.replyToJob(job?.jobId as string, { status: "replied", reply: "made it" });

    expect(await (await shimResponse).json()).toEqual({ status: "replied", reply: "made it" });
  });

  test("a failed wake nothing follows still answers every queued job, one timeout later", async () => {
    const harness = createHarness({ wakeTimeoutMs: 20 });

    harness.workerSession.setFailWorkerStart(true);

    const startedAt = Date.now();

    const shimResponse = harness.sendShimMessage("no worker to wake");

    expect(await (await shimResponse).json()).toEqual({ status: "noListener" });

    // The bounded wait, not the instant refusal that raced real launches
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
  });

  test("a wake nothing follows times out instead of parking the job forever", async () => {
    const harness = createHarness({ wakeTimeoutMs: 20 });

    const shimResponse = harness.sendShimMessage("stuck");

    expect(await (await shimResponse).json()).toEqual({ status: "noListener" });
  });

  test("carries a port both ways: connect, messages, and disconnects", async () => {
    const harness = createHarness();

    const workerStream = await harness.openWorkerStream();

    const shimPort = await harness.connectShimPort("port-1");

    const [connectJob] = await workerStream.waitForJobs(1);

    if (connectJob?.type !== "connect") {
      throw new Error("Expected a connect job");
    }

    expect(connectJob.portId).toBe("port-1");
    expect(connectJob.name).toBe("relay");
    expect(connectJob.sender.tab?.id).toBe(7);

    await harness.ackJob(connectJob.jobId);

    await harness.replyToJob(connectJob.jobId, { status: "connected" });

    // Worker to content script
    await harness.workerSession.request(RUNTIME_PROXY_PATHS.workerPortPost, WORKER_TOKEN, {
      portId: "port-1",
      message: { locked: false },
    });

    expect(await shimPort.waitForFrames(1)).toEqual([
      { type: "message", message: { locked: false } },
    ]);

    // Content script to worker
    await harness.shimSession.request(RUNTIME_PROXY_PATHS.portPost, SHIM_TOKEN, {
      portId: "port-1",
      message: "fill",
    });

    const [, portMessageJob] = await workerStream.waitForJobs(2);

    expect(portMessageJob).toMatchObject({
      type: "portMessage",
      portId: "port-1",
      message: "fill",
    });

    // The worker hangs up; the shim hears a clean disconnect
    await harness.workerSession.request(RUNTIME_PROXY_PATHS.workerPortDisconnect, WORKER_TOKEN, {
      portId: "port-1",
    });

    expect((await shimPort.waitForFrames(2))[1]).toEqual({ type: "disconnect", error: undefined });
  });

  test("the shim disconnecting tells the worker", async () => {
    const harness = createHarness();

    const workerStream = await harness.openWorkerStream();

    await harness.connectShimPort("port-2");

    const [connectJob] = await workerStream.waitForJobs(1);

    if (connectJob?.type !== "connect") {
      throw new Error("Expected a connect job");
    }

    await harness.ackJob(connectJob.jobId);

    await harness.replyToJob(connectJob.jobId, { status: "connected" });

    await harness.shimSession.request(RUNTIME_PROXY_PATHS.portDisconnect, SHIM_TOKEN, {
      portId: "port-2",
    });

    const [, disconnectJob] = await workerStream.waitForJobs(2);

    expect(disconnectJob).toMatchObject({ type: "portDisconnect", portId: "port-2" });
  });

  test("a connect nothing listens to disconnects with the receiving-end error", async () => {
    const harness = createHarness();

    const workerStream = await harness.openWorkerStream();

    const shimPort = await harness.connectShimPort("port-3");

    const [connectJob] = await workerStream.waitForJobs(1);

    if (connectJob?.type !== "connect") {
      throw new Error("Expected a connect job");
    }

    await harness.ackJob(connectJob.jobId);

    await harness.replyToJob(connectJob.jobId, { status: "noListener" });

    expect(await shimPort.waitForFrames(1)).toEqual([
      { type: "disconnect", error: RECEIVING_END_ERROR },
    ]);
  });

  test("a worker stop disconnects the established ports", async () => {
    const harness = createHarness();

    harness.workerSession.reportWorkerRunning(1);

    const workerStream = await harness.openWorkerStream();

    const shimPort = await harness.connectShimPort("port-4");

    const [connectJob] = await workerStream.waitForJobs(1);

    if (connectJob?.type !== "connect") {
      throw new Error("Expected a connect job");
    }

    await harness.ackJob(connectJob.jobId);

    await harness.replyToJob(connectJob.jobId, { status: "connected" });

    harness.workerSession.reportWorkerStopping(1);

    expect(await shimPort.waitForFrames(1)).toEqual([{ type: "disconnect", error: undefined }]);
  });

  test("a stop of a worker that is not an extension's settles nothing", async () => {
    const harness = createHarness();

    harness.workerSession.reportWorkerRunning(1);

    // The account's own worker in the session that keeps the extension —
    // Gmail's, which idle-stops routinely and owes the relay nothing
    harness.workerSession.reportWorkerRunning(2, "https://mail.google.com/mail/");

    const workerStream = await harness.openWorkerStream();

    const shimPort = await harness.connectShimPort("port-6");

    const [connectJob] = await workerStream.waitForJobs(1);

    if (connectJob?.type !== "connect") {
      throw new Error("Expected a connect job");
    }

    await harness.ackJob(connectJob.jobId);

    await harness.replyToJob(connectJob.jobId, { status: "connected" });

    const shimResponse = harness.sendShimMessage("awaiting a reply");

    const [, messageJob] = await workerStream.waitForJobs(2);

    if (messageJob?.type !== "sendMessage") {
      throw new Error("Expected a sendMessage job");
    }

    await harness.ackJob(messageJob.jobId);

    harness.workerSession.reportWorkerStopping(2);

    harness.workerSession.reportWorkerStopped(2);

    expect(workerStream.isEnded()).toBe(false);

    expect(shimPort.frames).toEqual([]);

    // The acked message would have been failed as a closed port by a stop that
    // settled every stream; the extension's own worker answers it instead
    await harness.replyToJob(messageJob.jobId, { status: "replied", reply: "unlocked" });

    expect(await (await shimResponse).json()).toEqual({ status: "replied", reply: "unlocked" });
  });

  test("a stop of a version never seen starting still settles every stream", async () => {
    const harness = createHarness();

    const workerStream = await harness.openWorkerStream();

    // Nothing names this version, so nothing rules out the extension's worker
    harness.workerSession.reportWorkerStopping(9);

    await waitFor(() => workerStream.isEnded(), "the parked stream to be invalidated");
  });

  test("a torn-down shim session closes its ports and tells the worker", async () => {
    const harness = createHarness();

    const workerStream = await harness.openWorkerStream();

    await harness.connectShimPort("port-5");

    const [connectJob] = await workerStream.waitForJobs(1);

    if (connectJob?.type !== "connect") {
      throw new Error("Expected a connect job");
    }

    await harness.ackJob(connectJob.jobId);

    await harness.replyToJob(connectJob.jobId, { status: "connected" });

    harness.proxy.teardownSession(harness.shimSession.session);

    const [, disconnectJob] = await workerStream.waitForJobs(2);

    expect(disconnectJob).toMatchObject({ type: "portDisconnect", portId: "port-5" });
  });

  test("refuses the worker routes from any other session", async () => {
    const harness = createHarness();

    expect(
      (await harness.shimSession.request(RUNTIME_PROXY_PATHS.workerJobs, SHIM_TOKEN, {})).status,
    ).toBe(403);

    expect(
      (
        await harness.shimSession.request(RUNTIME_PROXY_PATHS.workerAck, SHIM_TOKEN, {
          jobId: "guessed",
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await harness.shimSession.request(RUNTIME_PROXY_PATHS.workerReply, SHIM_TOKEN, {
          jobId: "guessed",
          result: { status: "replied", reply: "spoofed" },
        })
      ).status,
    ).toBe(403);
  });

  test("refuses the shim routes from the worker session, whose messaging is native", async () => {
    const harness = createHarness();

    expect(
      (
        await harness.workerSession.request(RUNTIME_PROXY_PATHS.sendMessage, WORKER_TOKEN, {
          message: "loop",
          sender: SENDER_REPORT,
        })
      ).status,
    ).toBe(400);
  });

  test("a fresh worker stream takes over from the stale one", async () => {
    const harness = createHarness();

    const staleStream = await harness.openWorkerStream();

    const freshStream = await harness.openWorkerStream();

    await waitFor(() => staleStream.isEnded(), "the stale stream to end");

    const shimResponse = harness.sendShimMessage("to the fresh stream");

    const [job] = await freshStream.waitForJobs(1);

    if (job?.type !== "sendMessage") {
      throw new Error("Expected a sendMessage job");
    }

    await harness.ackJob(job.jobId);

    await harness.replyToJob(job.jobId, { status: "replied", reply: "heard" });

    expect(await (await shimResponse).json()).toEqual({ status: "replied", reply: "heard" });
  });

  test("the worker session going away answers shims like a missing receiving end", async () => {
    const harness = createHarness();

    harness.proxy.teardownSession(harness.workerSession.session);

    const shimResponse = await harness.sendShimMessage("anyone?");

    expect(await shimResponse.json()).toEqual({ status: "noListener" });
  });

  /*
   * The launch window the embedder's ordering closes: the worker session is set
   * up before any session that could message it. This is what makes a window
   * that should never open cost a wait rather than a wrong answer — a job that
   * arrives first waits for the adoption instead of being told the receiving
   * end does not exist.
   *
   * The waits are what make this reach the path it names. The enqueue has to
   * land before the adoption, which the log line is the only signal for: a
   * bridge request is answered across several awaits, so calling
   * `adoptWorkerSession()` on the next line would set the session first and
   * test the ordinary path instead. And the adoption has to be what drives the
   * queue, which `startWorkerForScope` on the adopted session is the only
   * observable for: a stream parked afterwards flushes the queue by itself, so
   * every assertion below would pass with the driving removed.
   */
  test("a job enqueued before the worker session is adopted is driven by the adoption", async () => {
    const logs: string[] = [];

    const harness = createHarness(
      { logger: { info: (message) => logs.push(message), error: () => undefined } },
      { adoptWorkerSession: false },
    );

    const shimResponse = harness.sendShimMessage("early");

    await waitFor(
      () => logs.some((message) => message.startsWith("No extension worker session yet")),
      "the job to be queued with no worker session",
    );

    // Nothing was woken, and nothing was refused either
    expect(harness.workerSession.workerStarts).toEqual([]);

    harness.adoptWorkerSession();

    // The adoption drives the queue: this is the wake the job was waiting for
    await waitFor(
      () => harness.workerSession.workerStarts.length === 1,
      "the adopted session's wake",
    );

    expect(harness.workerSession.workerStarts).toEqual([EXTENSION_SCOPE]);

    const workerStream = await harness.openWorkerStream();

    const [job] = await workerStream.waitForJobs(1);

    if (job?.type !== "sendMessage") {
      throw new Error("Expected a sendMessage job");
    }

    expect(job.message).toBe("early");

    await harness.ackJob(job.jobId);

    await harness.replyToJob(job.jobId, { status: "replied", reply: "late but here" });

    expect(await (await shimResponse).json()).toEqual({
      status: "replied",
      reply: "late but here",
    });
  });

  test("a job enqueued before an adoption that never comes fails one timeout later", async () => {
    const harness = createHarness({ wakeTimeoutMs: 20 }, { adoptWorkerSession: false });

    const startedAt = Date.now();

    const shimResponse = await harness.sendShimMessage("nobody home");

    expect(await shimResponse.json()).toEqual({ status: "noListener" });

    // The bounded wait, not the instant refusal this replaced
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
  });

  test("a session adopted after the worker session went away is woken", async () => {
    const harness = createHarness();

    // A wake is pending on the session that is about to go
    harness.sendShimMessage("wakes the old session");

    await waitFor(() => harness.workerSession.workerStarts.length === 1, "the first wake");

    harness.proxy.teardownSession(harness.workerSession.session);

    const adoptedSession = createFakeSession();

    harness.proxy.setWorkerSession(adoptedSession.session);

    harness.sendShimMessage("wakes the adopted session");

    await waitFor(() => adoptedSession.workerStarts.length === 1, "the adopted session's wake");

    expect(adoptedSession.workerStarts).toEqual([EXTENSION_SCOPE]);
  });
});

// The shim maps the relay's failure statuses onto Chrome's error strings; the
// exact words are contractual, so a drift fails here rather than in 1Password
test("the failure statuses map to Chrome's own words", () => {
  expect(RECEIVING_END_ERROR).toBe("Could not establish connection. Receiving end does not exist.");
  expect(PORT_CLOSED_ERROR).toBe("The message port closed before a response was received.");
});

/**
 * The storage half of the proxy, through the same bridge and the same two fake
 * sessions: a shimmed context's `chrome.storage` call reaches the worker as a
 * job, and the two refusals Chromium would have made in the caller's own
 * process are made here instead, because the call is answered in a privileged
 * one that Chromium would never refuse.
 */
describe("RuntimeProxy storage", () => {
  const EXTENSION_PAGE_URL = `${EXTENSION_SCHEME_PREFIX}${EXTENSION_ID}/popup.html`;

  /** A frame of the shim's session on the extension's own origin. */
  function createExtensionPageFrame() {
    return {
      url: EXTENSION_PAGE_URL,
      parent: null,
      isDestroyed: () => false,
    } as unknown as WebFrameMain;
  }

  function sendStorageCall(
    harness: ReturnType<typeof createHarness>,
    call: RuntimeProxyStorageCall,
    { callerFrame = harness.page.frame, url = PAGE_URL } = {},
  ) {
    return harness.shimSession.request(
      RUNTIME_PROXY_PATHS.storageCall,
      SHIM_TOKEN,
      { call, sender: { url, isTopFrame: true } },
      callerFrame,
    );
  }

  function reportAccessLevel(
    harness: ReturnType<typeof createHarness>,
    body: Record<string, unknown>,
  ) {
    return harness.workerSession.request(
      RUNTIME_PROXY_PATHS.workerStorageAccessLevel,
      WORKER_TOKEN,
      body,
    );
  }

  test("carries a call to the worker and its answer back", async () => {
    const harness = createHarness();

    const stream = await harness.openWorkerStream();

    const callResponse = sendStorageCall(harness, {
      area: "local",
      method: "get",
      arguments: ["unlocked"],
    });

    const [job] = await stream.waitForJobs(1);

    expect(job).toEqual({
      type: "storage",
      jobId: (job as { jobId: string }).jobId,
      call: { area: "local", method: "get", arguments: ["unlocked"] },
      isTrustedContext: false,
    });

    await harness.ackJob((job as { jobId: string }).jobId);

    await harness.replyToJob((job as { jobId: string }).jobId, {
      status: "ok",
      value: { unlocked: true },
    });

    expect(await (await callResponse).json()).toEqual({
      status: "ok",
      value: { unlocked: true },
    });
  });

  test("wakes a stopped worker for a storage call, like any other job", async () => {
    const harness = createHarness();

    void sendStorageCall(harness, { area: "local", method: "get", arguments: [] });

    await waitFor(() => harness.workerSession.workerStarts.length > 0, "the worker wake");

    expect(harness.workerSession.workerStarts).toEqual([EXTENSION_SCOPE]);
  });

  test("a call that never reaches the store says so, rather than borrowing a messaging error", async () => {
    const harness = createHarness();

    harness.proxy.teardownSession(harness.workerSession.session);

    const callResponse = await sendStorageCall(harness, {
      area: "local",
      method: "get",
      arguments: [],
    });

    expect(await callResponse.json()).toEqual({
      status: "error",
      message: STORAGE_UNAVAILABLE_ERROR,
    });
  });

  test("a content script is refused session storage, and an extension page is not", async () => {
    const harness = createHarness();

    const stream = await harness.openWorkerStream();

    const refused = await sendStorageCall(harness, {
      area: "session",
      method: "get",
      arguments: [],
    });

    expect(await refused.json()).toEqual({
      status: "error",
      message: STORAGE_ACCESS_DENIED_ERROR,
    });

    // Nothing was relayed: the refusal is the whole answer
    expect(stream.jobs).toEqual([]);

    void sendStorageCall(
      harness,
      { area: "session", method: "get", arguments: [] },
      { callerFrame: createExtensionPageFrame(), url: EXTENSION_PAGE_URL },
    );

    const [job] = await stream.waitForJobs(1);

    expect((job as { type: string }).type).toBe("storage");
  });

  test("the level the worker reports is what a content script is held to", async () => {
    const harness = createHarness();

    const stream = await harness.openWorkerStream();

    // 1Password closes its persistent store, which Chrome leaves open
    await reportAccessLevel(harness, { area: "local", accessLevel: "TRUSTED_CONTEXTS" });

    const refused = await sendStorageCall(harness, {
      area: "local",
      method: "get",
      arguments: [],
    });

    expect(await refused.json()).toEqual({
      status: "error",
      message: STORAGE_ACCESS_DENIED_ERROR,
    });

    await reportAccessLevel(harness, {
      area: "local",
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });

    void sendStorageCall(harness, { area: "local", method: "get", arguments: [] });

    await stream.waitForJobs(1);
  });

  test("a queued call is refused again when the worker's level arrives while it waits", async () => {
    const harness = createHarness();

    // Nothing parked, so the call is queued behind a wake and measured against
    // the permissive default it arrives under
    const callResponse = sendStorageCall(harness, {
      area: "local",
      method: "get",
      arguments: ["unlocked"],
    });

    await waitFor(() => harness.workerSession.workerStarts.length > 0, "the worker wake");

    // The worker boots and closes the area, which is 1Password's own shape
    await reportAccessLevel(harness, { area: "local", accessLevel: "TRUSTED_CONTEXTS" });

    const stream = await harness.openWorkerStream();

    expect(await (await callResponse).json()).toEqual({
      status: "error",
      message: STORAGE_ACCESS_DENIED_ERROR,
    });

    // And it never reached the worker
    expect(stream.jobs).toEqual([]);
  });

  test("only the worker session may report an access level", async () => {
    const harness = createHarness();

    const response = await harness.shimSession.request(
      RUNTIME_PROXY_PATHS.workerStorageAccessLevel,
      SHIM_TOKEN,
      { area: "local", accessLevel: "TRUSTED_CONTEXTS" },
      harness.page.frame,
    );

    expect(response.status).toBe(403);

    // And the refused report changed nothing
    const stream = await harness.openWorkerStream();

    void sendStorageCall(harness, { area: "local", method: "get", arguments: [] });

    await stream.waitForJobs(1);
  });

  test("a content script never sets an access level", async () => {
    const harness = createHarness();

    const refused = await sendStorageCall(harness, {
      area: "local",
      method: "setAccessLevel",
      arguments: [{ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }],
    });

    expect(await refused.json()).toEqual({
      status: "error",
      message: STORAGE_ACCESS_LEVEL_CONTEXT_ERROR,
    });
  });

  test("the levels go away with the worker session that held the store", async () => {
    const harness = createHarness();

    await reportAccessLevel(harness, { area: "local", accessLevel: "TRUSTED_CONTEXTS" });

    harness.proxy.teardownSession(harness.workerSession.session);

    harness.proxy.setWorkerSession(harness.workerSession.session);

    const stream = await harness.openWorkerStream();

    void sendStorageCall(harness, { area: "local", method: "get", arguments: [] });

    await stream.waitForJobs(1);
  });

  test("a malformed call is refused before anything is relayed", async () => {
    const harness = createHarness();

    const stream = await harness.openWorkerStream();

    const response = await harness.shimSession.request(
      RUNTIME_PROXY_PATHS.storageCall,
      SHIM_TOKEN,
      { call: { area: "cookies", method: "get", arguments: [] }, sender: SENDER_REPORT },
      harness.page.frame,
    );

    expect(response.status).toBe(400);

    expect(stream.jobs).toEqual([]);
  });

  test("the worker session's own contexts are refused: their storage is the real one", async () => {
    const harness = createHarness();

    const response = await harness.workerSession.request(
      RUNTIME_PROXY_PATHS.storageCall,
      WORKER_TOKEN,
      { call: { area: "local", method: "get", arguments: [] }, sender: SENDER_REPORT },
    );

    expect(response.status).toBe(400);
  });
});
