import { randomUUID } from "node:crypto";
import type { Session, WebFrameMain } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import type { ExtensionsLogger } from "../logger";
import { encodeNativeMessage } from "../native-messaging/framing";
import {
  EXTENSION_SCHEME_PREFIX,
  PORT_CLOSED_ERROR,
  RECEIVING_END_ERROR,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyConnectRequest,
  type RuntimeProxyConnectResult,
  type RuntimeProxyJob,
  type RuntimeProxyPortDisconnectRequest,
  type RuntimeProxyPortFrame,
  type RuntimeProxyPortPostRequest,
  type RuntimeProxySender,
  type RuntimeProxySendMessageRequest,
  type RuntimeProxySendMessageResult,
  type RuntimeProxyWorkerAckRequest,
  type RuntimeProxyWorkerPortDisconnectRequest,
  type RuntimeProxyWorkerPortPostRequest,
  type RuntimeProxyWorkerReplyRequest,
} from "./bridge-protocol";
import { type GetWebContentsFromFrame, parseSenderReport, reconstructSender } from "./sender";

type RelayJobBase = {
  jobId: string;
  extensionId: string;
  /** The session whose shim asked, for tearing its jobs down with it. */
  shimSession: Session;
  /** How often the job has been handed to a stream, bounding redelivery. */
  attempts: number;
  state: "queued" | "handed" | "acked";
  /** Runs while the job is in flight, so a worker that dies quietly ends it. */
  timer: ReturnType<typeof setTimeout> | undefined;
};

type SendMessageJob = RelayJobBase & {
  kind: "sendMessage";
  message: unknown;
  sender: RuntimeProxySender;
  settle: (result: RuntimeProxySendMessageResult) => void;
  isSettled: boolean;
};

type ConnectJob = RelayJobBase & {
  kind: "connect";
  portId: string;
  name: string | undefined;
  sender: RuntimeProxySender;
};

type PortMessageJob = RelayJobBase & {
  kind: "portMessage";
  portId: string;
  message: unknown;
};

type PortDisconnectJob = RelayJobBase & {
  kind: "portDisconnect";
  portId: string;
};

type RelayJob = SendMessageJob | ConnectJob | PortMessageJob | PortDisconnectJob;

type WorkerStream = {
  extensionId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  isClosed: boolean;
};

type ProxyPort = {
  id: string;
  extensionId: string;
  shimSession: Session;
  controller: ReadableStreamDefaultController<Uint8Array>;
  isClosed: boolean;
};

type Wake = {
  timer: ReturnType<typeof setTimeout> | undefined;
};

export type RuntimeProxyOptions = {
  logger?: ExtensionsLogger;
  /** How a caller frame resolves to its hosting tab for sender reconstruction. */
  getWebContentsFromFrame?: GetWebContentsFromFrame;
  /**
   * How long jobs queued behind a worker wake wait for the woken worker's job
   * stream before they fail the way a missing receiving end does.
   */
  wakeTimeoutMs?: number;
  /**
   * How often an un-acked job is handed to a fresh stream before it fails
   * rather than chase a worker that takes jobs without ever acking them.
   */
  maxDeliveryAttempts?: number;
  /**
   * How long a job handed to the worker may go unanswered before it fails the
   * way Chrome's closed message port does.
   */
  inFlightTimeoutMs?: number;
};

const DEFAULT_WAKE_TIMEOUT_MS = 10_000;

const DEFAULT_MAX_DELIVERY_ATTEMPTS = 3;

/**
 * Five minutes, which is a backstop rather than a latency budget. Chrome puts
 * no deadline on a `sendMessage` reply and neither should this: 1Password's
 * biometric unlock answers only once the desktop app has prompted the user and
 * been satisfied, and a timeout tight enough to feel responsive would be the
 * thing that broke it. What this bounds is the wedge — a worker that dies
 * without the session ever reporting it stopped.
 */
const DEFAULT_IN_FLIGHT_TIMEOUT_MS = 5 * 60_000;

/**
 * The main-process relay carrying `chrome.runtime` messaging between
 * content-script-only sessions — their content scripts and their extension
 * pages alike — and the one session that keeps an extension's service worker.
 *
 * The shim's calls arrive as bridge requests; jobs flow to the worker on a
 * streaming response its relay client keeps parked, and replies come back as
 * bridge requests of the worker's own. Delivery is bookkept rather than
 * assumed, because a `protocol.handle` request's abort signal never fires when
 * the worker behind it is killed (measured 2026-08-25): a parked stream from a
 * dead worker looks live forever, so streams are invalidated from the session's
 * `running-status-changed` events, every handed job is acked by id, and an
 * un-acked job is handed again to the next stream while an acked one that lost
 * its worker fails the way Chrome's closed message port does. A stopped worker
 * is woken with `startWorkerForScope` the moment a job needs it.
 */
export class RuntimeProxy {
  private logger: ExtensionsLogger | undefined;

  private getWebContentsFromFrame: GetWebContentsFromFrame | undefined;

  private wakeTimeoutMs: number;

  private maxDeliveryAttempts: number;

  private inFlightTimeoutMs: number;

  private workerSession: Session | undefined;

  private removeWorkerSessionListener: (() => void) | undefined;

  /**
   * Scopes seen starting, the only way to name a worker once it is stopping.
   * A version whose scope is not an extension's — the account's own page
   * workers, Gmail's included — is recorded as `null`: the scope itself is of
   * no use here, but knowing the version tells its stop apart from the stop of
   * a worker this proxy never saw start.
   */
  private scopesByVersionId = new Map<number, string | null>();

  private workerStreams = new Map<string, WorkerStream>();

  private queuedJobs = new Map<string, RelayJob[]>();

  private inFlightJobs = new Map<string, RelayJob>();

  private ports = new Map<string, ProxyPort>();

  private wakes = new Map<string, Wake>();

  constructor({
    logger,
    getWebContentsFromFrame,
    wakeTimeoutMs = DEFAULT_WAKE_TIMEOUT_MS,
    maxDeliveryAttempts = DEFAULT_MAX_DELIVERY_ATTEMPTS,
    inFlightTimeoutMs = DEFAULT_IN_FLIGHT_TIMEOUT_MS,
  }: RuntimeProxyOptions = {}) {
    this.logger = logger;

    this.getWebContentsFromFrame = getWebContentsFromFrame;

    this.wakeTimeoutMs = wakeTimeoutMs;

    this.maxDeliveryAttempts = maxDeliveryAttempts;

    this.inFlightTimeoutMs = inFlightTimeoutMs;
  }

  registerRoutes(bridge: ExtensionBridge) {
    bridge.handle(
      RUNTIME_PROXY_PATHS.sendMessage,
      ({ session, extensionId, senderFrame, body, headers }) =>
        this.handleSendMessage(session, extensionId, senderFrame, body, headers),
    );

    bridge.handle(
      RUNTIME_PROXY_PATHS.connect,
      ({ session, extensionId, senderFrame, body, headers }) =>
        this.handleConnect(session, extensionId, senderFrame, body, headers),
    );

    bridge.handle(RUNTIME_PROXY_PATHS.portPost, ({ session, extensionId, body, headers }) => {
      const { portId, message } = body as unknown as RuntimeProxyPortPostRequest;

      const port = this.getShimPort(session, extensionId, portId);

      if (port) {
        this.enqueueJob(
          this.createJob(port.shimSession, extensionId, "portMessage", { portId, message }),
        );
      }

      return new Response(null, { status: 204, headers });
    });

    bridge.handle(RUNTIME_PROXY_PATHS.portDisconnect, ({ session, extensionId, body, headers }) => {
      const { portId } = body as unknown as RuntimeProxyPortDisconnectRequest;

      const port = this.getShimPort(session, extensionId, portId);

      if (port) {
        this.closeShimPort(port, { notifyWorker: true });
      }

      return new Response(null, { status: 204, headers });
    });

    bridge.handle(RUNTIME_PROXY_PATHS.workerJobs, ({ session, extensionId, headers }) =>
      this.handleWorkerJobs(session, extensionId, headers),
    );

    bridge.handle(RUNTIME_PROXY_PATHS.workerAck, ({ session, body, headers }) => {
      if (session === this.workerSession) {
        this.handleWorkerAck((body as unknown as RuntimeProxyWorkerAckRequest).jobId);
      }

      return new Response(null, { status: session === this.workerSession ? 204 : 403, headers });
    });

    bridge.handle(RUNTIME_PROXY_PATHS.workerReply, ({ session, body, headers }) => {
      if (session === this.workerSession) {
        this.handleWorkerReply(body as unknown as RuntimeProxyWorkerReplyRequest);
      }

      return new Response(null, { status: session === this.workerSession ? 204 : 403, headers });
    });

    bridge.handle(RUNTIME_PROXY_PATHS.workerPortPost, ({ session, extensionId, body, headers }) => {
      const { portId, message } = body as unknown as RuntimeProxyWorkerPortPostRequest;

      if (session === this.workerSession) {
        const port = this.ports.get(portId);

        if (port && !port.isClosed && port.extensionId === extensionId) {
          this.sendPortFrame(port, { type: "message", message });
        }
      }

      return new Response(null, { status: session === this.workerSession ? 204 : 403, headers });
    });

    bridge.handle(
      RUNTIME_PROXY_PATHS.workerPortDisconnect,
      ({ session, extensionId, body, headers }) => {
        const { portId } = body as unknown as RuntimeProxyWorkerPortDisconnectRequest;

        if (session === this.workerSession) {
          const port = this.ports.get(portId);

          if (port && port.extensionId === extensionId) {
            // The worker hung up on purpose, which Chrome reports without error
            this.closeShimPort(port, { notifyWorker: false });
          }
        }

        return new Response(null, { status: session === this.workerSession ? 204 : 403, headers });
      },
    );
  }

  /**
   * The session that keeps the workers. Its `running-status-changed` events are
   * what invalidate parked job streams, since nothing else says a worker died.
   */
  setWorkerSession(session: Session) {
    this.removeWorkerSessionListener?.();

    this.workerSession = session;

    const statusListener = (details: { versionId: number; runningStatus: string }) => {
      this.handleRunningStatusChanged(details.versionId, details.runningStatus);
    };

    session.serviceWorkers.on("running-status-changed", statusListener);

    this.removeWorkerSessionListener = () => {
      session.serviceWorkers.removeListener("running-status-changed", statusListener);

      this.removeWorkerSessionListener = undefined;
    };
  }

  teardownSession(session: Session) {
    if (session === this.workerSession) {
      this.removeWorkerSessionListener?.();

      this.workerSession = undefined;

      for (const extensionId of this.workerStreams.keys()) {
        this.invalidateWorkerStream(extensionId);
      }

      for (const extensionId of this.queuedJobs.keys()) {
        this.failQueuedJobs(extensionId, "noListener");
      }

      // The bookkeeping of the session that just went is worse than useless to
      // the next one: a pending wake would make `wakeWorker` return early for a
      // session that was never asked to start the worker, and its timer would
      // then fail that session's queue; a version id means nothing outside the
      // session that issued it
      for (const extensionId of this.wakes.keys()) {
        this.clearWake(extensionId);
      }

      this.scopesByVersionId.clear();

      return;
    }

    for (const port of this.ports.values()) {
      if (port.shimSession === session) {
        this.closeShimPort(port, { notifyWorker: true });
      }
    }

    for (const [extensionId, queue] of this.queuedJobs) {
      const keptJobs = queue.filter((job) => job.shimSession !== session);

      for (const job of queue) {
        if (job.shimSession === session) {
          this.failJob(job, "closed");
        }
      }

      this.queuedJobs.set(extensionId, keptJobs);
    }
  }

  private async handleSendMessage(
    session: Session,
    extensionId: string,
    senderFrame: WebFrameMain | undefined,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const request = body as unknown as RuntimeProxySendMessageRequest;

    const report = parseSenderReport(request.sender);

    if (!report || session === this.workerSession) {
      return new Response(null, { status: 400, headers });
    }

    const result = await new Promise<RuntimeProxySendMessageResult>((resolve) => {
      const job = this.createJob(session, extensionId, "sendMessage", {
        message: request.message,
        sender: this.reconstructSender(session, extensionId, report, senderFrame),
        settle: resolve,
        isSettled: false,
      });

      this.enqueueJob(job);
    });

    return Response.json(result, { headers });
  }

  private handleConnect(
    session: Session,
    extensionId: string,
    senderFrame: WebFrameMain | undefined,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const request = body as unknown as RuntimeProxyConnectRequest;

    const report = parseSenderReport(request.sender);

    if (
      !report ||
      typeof request.portId !== "string" ||
      this.ports.has(request.portId) ||
      session === this.workerSession
    ) {
      return new Response(null, { status: 400, headers });
    }

    let port: ProxyPort | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        port = {
          id: request.portId,
          extensionId,
          shimSession: session,
          controller,
          isClosed: false,
        };

        this.ports.set(port.id, port);
      },
      cancel: () => {
        // The content script's context went away with its page, or the shim
        // canceled its reader behind a disconnect this bridge refused
        if (port) {
          this.closeShimPort(port, { notifyWorker: true });
        }
      },
    });

    this.enqueueJob(
      this.createJob(session, extensionId, "connect", {
        portId: request.portId,
        name: typeof request.name === "string" ? request.name : undefined,
        sender: this.reconstructSender(session, extensionId, report, senderFrame),
      }),
    );

    return new Response(stream, {
      headers: { ...headers, "content-type": "application/octet-stream" },
    });
  }

  private handleWorkerJobs(session: Session, extensionId: string, headers: Record<string, string>) {
    if (!this.workerSession || session !== this.workerSession) {
      return new Response(null, { status: 403, headers });
    }

    // Whatever stream was parked belongs to a worker that is gone — a fresh
    // worker opens a fresh stream — so its jobs and ports are settled first
    if (this.workerStreams.has(extensionId)) {
      this.invalidateWorkerStream(extensionId);
    }

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.workerStreams.set(extensionId, { extensionId, controller, isClosed: false });
      },
    });

    this.clearWake(extensionId);

    this.flushQueuedJobs(extensionId);

    return new Response(stream, {
      headers: { ...headers, "content-type": "application/octet-stream" },
    });
  }

  private handleWorkerAck(jobId: string) {
    const job = this.inFlightJobs.get(typeof jobId === "string" ? jobId : "");

    if (!job || job.state !== "handed") {
      return;
    }

    job.state = "acked";

    // Nothing more comes back for these; the ack is the end of their story
    if (job.kind === "portMessage" || job.kind === "portDisconnect") {
      this.removeInFlightJob(job);
    }
  }

  private handleWorkerReply({ jobId, result }: RuntimeProxyWorkerReplyRequest) {
    const job = this.inFlightJobs.get(typeof jobId === "string" ? jobId : "");

    if (!job) {
      return;
    }

    this.removeInFlightJob(job);

    if (job.kind === "sendMessage") {
      const sendMessageResult = result as RuntimeProxySendMessageResult;

      this.settleSendMessage(
        job,
        sendMessageResult?.status === "replied" || sendMessageResult?.status === "noListener"
          ? sendMessageResult
          : { status: "closed" },
      );

      return;
    }

    if (job.kind === "connect") {
      const connectResult = result as RuntimeProxyConnectResult;

      if (connectResult?.status !== "connected") {
        const port = this.ports.get(job.portId);

        if (port) {
          this.closeShimPort(port, { notifyWorker: false, error: RECEIVING_END_ERROR });
        }
      }
    }
  }

  private handleRunningStatusChanged(versionId: number, runningStatus: string) {
    if (!this.workerSession) {
      return;
    }

    if (runningStatus === "starting" || runningStatus === "running") {
      try {
        const { scope } = this.workerSession.serviceWorkers.getInfoFromVersionID(versionId);

        this.scopesByVersionId.set(
          versionId,
          scope.startsWith(EXTENSION_SCHEME_PREFIX) ? scope : null,
        );
      } catch {
        // A worker gone again before it was asked about names no stream
      }

      return;
    }

    if (runningStatus !== "stopping" && runningStatus !== "stopped") {
      return;
    }

    const isKnownVersion = this.scopesByVersionId.has(versionId);

    const scope = this.scopesByVersionId.get(versionId);

    if (runningStatus === "stopped") {
      this.scopesByVersionId.delete(versionId);
    }

    if (scope) {
      const extensionId = scope.slice(EXTENSION_SCHEME_PREFIX.length).replace(/\/.*$/, "");

      this.invalidateWorkerStream(extensionId);

      return;
    }

    // A worker that is not an extension's owes the relay nothing. Gmail's own
    // worker idle-stops routinely in this session, and settling every stream on
    // it would disconnect every relayed port and fail every message awaiting a
    // reply, twice per stop
    if (isKnownVersion) {
      return;
    }

    // A stop that cannot be pinned to a scope invalidates every stream: a live
    // worker's relay client parks a fresh one right away, and jobs are redelivered
    for (const extensionId of this.workerStreams.keys()) {
      this.invalidateWorkerStream(extensionId);
    }
  }

  /**
   * Settles everything the stream owed. Un-acked jobs may never have reached
   * the worker and are handed to the next stream; acked ones died with the
   * worker that took them, which for a message awaiting its reply is Chrome's
   * closed message port. The worker's ports died with it too, except ports
   * whose connect is queued again and so will be opened anew.
   */
  private invalidateWorkerStream(extensionId: string) {
    const stream = this.workerStreams.get(extensionId);

    if (stream) {
      this.workerStreams.delete(extensionId);

      stream.isClosed = true;

      try {
        stream.controller.close();
      } catch {
        // The stream is already gone when the worker's side canceled it
      }
    }

    for (const job of this.inFlightJobs.values()) {
      if (job.extensionId !== extensionId) {
        continue;
      }

      this.removeInFlightJob(job);

      if (job.state === "acked") {
        this.failJob(job, "closed");

        continue;
      }

      if (job.attempts >= this.maxDeliveryAttempts) {
        this.failJob(job, "noListener");

        continue;
      }

      job.state = "queued";

      this.queue(extensionId).push(job);
    }

    const requeuedConnectPortIds = new Set(
      this.queue(extensionId)
        .filter((job) => job.kind === "connect")
        .map((job) => (job as ConnectJob).portId),
    );

    for (const port of this.ports.values()) {
      if (port.extensionId === extensionId && !requeuedConnectPortIds.has(port.id)) {
        this.closeShimPort(port, { notifyWorker: false });
      }
    }

    if (this.queue(extensionId).length > 0) {
      this.ensureDelivery(extensionId);
    }
  }

  private createJob<Kind extends RelayJob["kind"]>(
    shimSession: Session,
    extensionId: string,
    kind: Kind,
    jobFields: Omit<Extract<RelayJob, { kind: Kind }>, keyof RelayJobBase | "kind">,
  ) {
    return {
      jobId: randomUUID(),
      extensionId,
      shimSession,
      attempts: 0,
      state: "queued",
      timer: undefined,
      kind,
      ...jobFields,
    } as unknown as Extract<RelayJob, { kind: Kind }>;
  }

  private queue(extensionId: string) {
    let queue = this.queuedJobs.get(extensionId);

    if (!queue) {
      queue = [];

      this.queuedJobs.set(extensionId, queue);
    }

    return queue;
  }

  private enqueueJob(job: RelayJob) {
    if (!this.workerSession) {
      this.failJob(job, "noListener");

      return;
    }

    this.queue(job.extensionId).push(job);

    this.ensureDelivery(job.extensionId);
  }

  private ensureDelivery(extensionId: string) {
    if (this.workerStreams.has(extensionId)) {
      this.flushQueuedJobs(extensionId);

      return;
    }

    this.wakeWorker(extensionId);
  }

  private flushQueuedJobs(extensionId: string) {
    const stream = this.workerStreams.get(extensionId);

    if (!stream || stream.isClosed) {
      return;
    }

    const queue = this.queue(extensionId);

    for (const job of queue.splice(0)) {
      job.state = "handed";

      job.attempts += 1;

      this.inFlightJobs.set(job.jobId, job);

      this.startInFlightTimer(job);

      try {
        stream.controller.enqueue(encodeNativeMessage(this.toJobFrame(job)));
      } catch {
        // The stream stopped taking frames under us; its worker is gone
        this.invalidateWorkerStream(extensionId);

        return;
      }
    }
  }

  /**
   * `startWorkerForScope` starts the extension's worker or does nothing when it
   * is already running — a running worker without a parked stream just hasn't
   * reconnected yet. Either way the queued jobs wait for a stream, bounded by
   * the wake timeout. The API is experimental on Electron 43, which is why the
   * tests pin its presence.
   */
  private wakeWorker(extensionId: string) {
    if (this.wakes.has(extensionId)) {
      return;
    }

    const workerSession = this.workerSession;

    if (!workerSession) {
      this.failQueuedJobs(extensionId, "noListener");

      return;
    }

    const wake: Wake = { timer: undefined };

    this.wakes.set(extensionId, wake);

    Promise.resolve()
      .then(() =>
        workerSession.serviceWorkers.startWorkerForScope(
          `${EXTENSION_SCHEME_PREFIX}${extensionId}/`,
        ),
      )
      .then(() => {
        if (this.wakes.get(extensionId) !== wake) {
          return;
        }

        wake.timer = setTimeout(() => {
          this.wakes.delete(extensionId);

          this.failQueuedJobs(extensionId, "noListener");
        }, this.wakeTimeoutMs);
      })
      .catch((error: unknown) => {
        if (this.wakes.get(extensionId) !== wake) {
          return;
        }

        /*
         * A rejection is Chromium finding no registration for the scope, and
         * at a cold launch that is a window rather than a verdict: the worker
         * session is still loading its copy of the extension, and
         * `startWorkerForScope` fails with "not found" until the first
         * registration is stored. Another session's content scripts inject at
         * document_start and can message inside that window on every launch,
         * so the queued jobs wait for the stream the starting worker will
         * park, bounded by the same wake timeout as the resolve path, instead
         * of failing instantly as a receiving end that "does not exist". A
         * scope no worker ever registers for still fails the same way, one
         * timeout later — which is also closer to Chrome, where a message
         * never races the extension's own startup.
         */
        this.logger?.info(
          "Waking the extension service worker failed; waiting for it to register",
          {
            extensionId,
            error,
          },
        );

        wake.timer = setTimeout(() => {
          this.wakes.delete(extensionId);

          this.failQueuedJobs(extensionId, "noListener");
        }, this.wakeTimeoutMs);
      });
  }

  private clearWake(extensionId: string) {
    const wake = this.wakes.get(extensionId);

    if (!wake) {
      return;
    }

    this.wakes.delete(extensionId);

    if (wake.timer !== undefined) {
      clearTimeout(wake.timer);
    }
  }

  /**
   * The only death signal a worker gives is its session's
   * `running-status-changed`, and a worker that crashes, is killed, or is taken
   * by the out-of-memory killer may never produce one — the request's own abort
   * signal certainly does not. Without this a job handed to that worker stays
   * in flight for good, and since `handleSendMessage` holds its response open
   * until the job settles, the content script's `sendMessage` never resolves
   * and never rejects, where Chrome would long since have errored.
   *
   * A job the worker acked and died holding is Chrome's closed message port,
   * the same as losing the stream; one it never acked is treated as the missing
   * receiving end it looks like from here.
   */
  private startInFlightTimer(job: RelayJob) {
    job.timer = setTimeout(() => {
      /*
       * A timer that outlives its job is inert: the job it closes over is gone
       * from the map, or a re-handing replaced it with another object under the
       * same id. `removeInFlightJob` clears the handle as well, so the two
       * guard the same thing twice over — which is also why no test here can
       * observe the clearing, and why there isn't one pretending to.
       */
      if (this.inFlightJobs.get(job.jobId) !== job) {
        return;
      }

      this.removeInFlightJob(job);

      this.logger?.error("Extension service worker never answered a relayed job", {
        extensionId: job.extensionId,
        kind: job.kind,
      });

      this.failJob(job, job.state === "acked" ? "closed" : "noListener");
    }, this.inFlightTimeoutMs);
  }

  private removeInFlightJob(job: RelayJob) {
    this.inFlightJobs.delete(job.jobId);

    if (job.timer !== undefined) {
      clearTimeout(job.timer);

      job.timer = undefined;
    }
  }

  private failQueuedJobs(extensionId: string, failure: "noListener" | "closed") {
    for (const job of this.queue(extensionId).splice(0)) {
      this.failJob(job, failure);
    }
  }

  private failJob(job: RelayJob, failure: "noListener" | "closed") {
    if (job.kind === "sendMessage") {
      this.settleSendMessage(job, { status: failure });

      return;
    }

    const port = this.ports.get(job.portId);

    if (!port) {
      return;
    }

    if (job.kind === "connect") {
      this.closeShimPort(port, {
        notifyWorker: false,
        error: failure === "noListener" ? RECEIVING_END_ERROR : PORT_CLOSED_ERROR,
      });

      return;
    }

    // An undeliverable port job means the port's far end is gone for good
    this.closeShimPort(port, { notifyWorker: false });
  }

  private settleSendMessage(job: SendMessageJob, result: RuntimeProxySendMessageResult) {
    if (job.isSettled) {
      return;
    }

    job.isSettled = true;

    this.removeInFlightJob(job);

    job.settle(result);
  }

  private getShimPort(session: Session, extensionId: string, portId: unknown) {
    if (typeof portId !== "string") {
      return undefined;
    }

    const port = this.ports.get(portId);

    if (
      !port ||
      port.isClosed ||
      port.shimSession !== session ||
      port.extensionId !== extensionId
    ) {
      return undefined;
    }

    return port;
  }

  private closeShimPort(
    port: ProxyPort,
    { notifyWorker, error }: { notifyWorker: boolean; error?: string },
  ) {
    if (port.isClosed) {
      return;
    }

    port.isClosed = true;

    this.ports.delete(port.id);

    // Jobs still queued for this port have nowhere to land any more. When the
    // connect itself is among them the worker never learned the port existed,
    // and there is nothing to tell it either.
    const queue = this.queue(port.extensionId);

    const keptJobs: RelayJob[] = [];

    let wasConnectQueued = false;

    for (const job of queue) {
      if (job.kind !== "connect" && job.kind !== "portMessage" && job.kind !== "portDisconnect") {
        keptJobs.push(job);

        continue;
      }

      if (job.portId !== port.id) {
        keptJobs.push(job);

        continue;
      }

      if (job.kind === "connect") {
        wasConnectQueued = true;
      }
    }

    queue.splice(0, queue.length, ...keptJobs);

    this.sendPortFrame(port, { type: "disconnect", error });

    try {
      port.controller.close();
    } catch {
      // The stream is already gone when the shim's side canceled it
    }

    if (notifyWorker && !wasConnectQueued) {
      this.enqueueJob(
        this.createJob(port.shimSession, port.extensionId, "portDisconnect", { portId: port.id }),
      );
    }
  }

  private sendPortFrame(port: ProxyPort, frame: RuntimeProxyPortFrame) {
    try {
      port.controller.enqueue(encodeNativeMessage(frame));
    } catch {
      // The stream no longer accepts frames when the shim's side canceled it
    }
  }

  private reconstructSender(
    session: Session,
    extensionId: string,
    report: { url: string; isTopFrame: boolean },
    senderFrame: WebFrameMain | undefined,
  ) {
    return reconstructSender({
      session,
      extensionId,
      report,
      senderFrame,
      getWebContentsFromFrame: this.getWebContentsFromFrame,
    });
  }

  private toJobFrame(job: RelayJob): RuntimeProxyJob {
    switch (job.kind) {
      case "sendMessage":
        return { type: "sendMessage", jobId: job.jobId, message: job.message, sender: job.sender };
      case "connect":
        return {
          type: "connect",
          jobId: job.jobId,
          portId: job.portId,
          name: job.name,
          sender: job.sender,
        };
      case "portMessage":
        return { type: "portMessage", jobId: job.jobId, portId: job.portId, message: job.message };
      case "portDisconnect":
        return { type: "portDisconnect", jobId: job.jobId, portId: job.portId };
    }
  }
}
