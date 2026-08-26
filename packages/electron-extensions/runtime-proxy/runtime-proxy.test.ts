import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Session, WebContents, WebFrameMain } from "electron";
import { ExtensionBridge } from "../bridge/bridge";
import { EXTENSION_BRIDGE_ORIGIN } from "../bridge/protocol";
import { NativeMessageDecoder } from "../native-messaging/framing";
import {
  PORT_CLOSED_ERROR,
  RECEIVING_END_ERROR,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyJob,
  type RuntimeProxyPortFrame,
} from "./bridge-protocol";
import { RuntimeProxy, type RuntimeProxyOptions } from "./runtime-proxy";

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

function createFakeSession() {
  let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

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
    request: (pathName: string, body: Record<string, unknown>) =>
      requestHandler?.(
        new Request(`${EXTENSION_BRIDGE_ORIGIN}${pathName}`, {
          method: "POST",
          body: JSON.stringify(body),
        }) as GlobalRequest,
      ) as Promise<Response>,
  };
}

function createPageContents() {
  const frame = {
    url: PAGE_URL,
    frameTreeNodeId: 12,
    parent: null,
    isDestroyed: () => false,
  };

  return {
    id: 7,
    isDestroyed: () => false,
    getURL: () => PAGE_URL,
    getTitle: () => "Sign in",
    mainFrame: { framesInSubtree: [frame] } as unknown as WebFrameMain,
  } as unknown as WebContents;
}

function createHarness(proxyOptions: RuntimeProxyOptions = {}) {
  const workerSession = createFakeSession();

  const shimSession = createFakeSession();

  const bridge = new ExtensionBridge();

  bridge.setupSession(workerSession.session, {
    getExtensionId: (bridgeToken) => (bridgeToken === WORKER_TOKEN ? EXTENSION_ID : undefined),
  });

  bridge.setupSession(shimSession.session, {
    getExtensionId: (bridgeToken) => (bridgeToken === SHIM_TOKEN ? EXTENSION_ID : undefined),
  });

  const proxy = new RuntimeProxy({
    getTabWebContents: () => [createPageContents()],
    ...proxyOptions,
  });

  proxy.registerRoutes(bridge);

  proxy.setWorkerSession(workerSession.session);

  /** Parks a worker job stream the way the relay client does, collecting jobs. */
  const openWorkerStream = async () => {
    const response = await workerSession.request(RUNTIME_PROXY_PATHS.workerJobs, {
      token: WORKER_TOKEN,
    });

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
    workerSession.request(RUNTIME_PROXY_PATHS.workerAck, { token: WORKER_TOKEN, jobId });

  const replyToJob = (jobId: string, result: Record<string, unknown>) =>
    workerSession.request(RUNTIME_PROXY_PATHS.workerReply, { token: WORKER_TOKEN, jobId, result });

  const sendShimMessage = (message: unknown) =>
    shimSession.request(RUNTIME_PROXY_PATHS.sendMessage, {
      token: SHIM_TOKEN,
      message,
      sender: SENDER_REPORT,
    });

  /** Opens a shim port and collects the frames streamed back to it. */
  const connectShimPort = async (portId: string, name = "relay") => {
    const response = await shimSession.request(RUNTIME_PROXY_PATHS.connect, {
      token: SHIM_TOKEN,
      portId,
      name,
      sender: SENDER_REPORT,
    });

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
    openWorkerStream,
    ackJob,
    replyToJob,
    sendShimMessage,
    connectShimPort,
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

    // Long enough that a timer left running would have fired by now
    await new Promise((resolve) => setTimeout(resolve, 80));
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

  test("a failed wake answers every queued job", async () => {
    const harness = createHarness();

    harness.workerSession.setFailWorkerStart(true);

    const shimResponse = harness.sendShimMessage("no worker to wake");

    expect(await (await shimResponse).json()).toEqual({ status: "noListener" });
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
    await harness.workerSession.request(RUNTIME_PROXY_PATHS.workerPortPost, {
      token: WORKER_TOKEN,
      portId: "port-1",
      message: { locked: false },
    });

    expect(await shimPort.waitForFrames(1)).toEqual([
      { type: "message", message: { locked: false } },
    ]);

    // Content script to worker
    await harness.shimSession.request(RUNTIME_PROXY_PATHS.portPost, {
      token: SHIM_TOKEN,
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
    await harness.workerSession.request(RUNTIME_PROXY_PATHS.workerPortDisconnect, {
      token: WORKER_TOKEN,
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

    await harness.shimSession.request(RUNTIME_PROXY_PATHS.portDisconnect, {
      token: SHIM_TOKEN,
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
      (await harness.shimSession.request(RUNTIME_PROXY_PATHS.workerJobs, { token: SHIM_TOKEN }))
        .status,
    ).toBe(403);

    expect(
      (
        await harness.shimSession.request(RUNTIME_PROXY_PATHS.workerAck, {
          token: SHIM_TOKEN,
          jobId: "guessed",
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await harness.shimSession.request(RUNTIME_PROXY_PATHS.workerReply, {
          token: SHIM_TOKEN,
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
        await harness.workerSession.request(RUNTIME_PROXY_PATHS.sendMessage, {
          token: WORKER_TOKEN,
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
});

// The shim maps the relay's failure statuses onto Chrome's error strings; the
// exact words are contractual, so a drift fails here rather than in 1Password
test("the failure statuses map to Chrome's own words", () => {
  expect(RECEIVING_END_ERROR).toBe("Could not establish connection. Receiving end does not exist.");
  expect(PORT_CLOSED_ERROR).toBe("The message port closed before a response was received.");
});
