import { randomUUID } from "node:crypto";
import type { Session, WebContents, WebFrameMain } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import type { ExtensionsLogger } from "../logger";
import { encodeNativeMessage } from "../native-messaging/framing";
import {
  EXTENSION_SCHEME_PREFIX,
  PORT_CLOSED_ERROR,
  type RuntimeProxyWorkerConnectToTabRequest,
  type RuntimeProxyWorkerConnectToTabResult,
  RECEIVING_END_ERROR,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyConnectRequest,
  type RuntimeProxyConnectResult,
  type RuntimeProxyJob,
  type RuntimeProxyPageEnvelope,
  type RuntimeProxyPortDisconnectRequest,
  type RuntimeProxyPortFrame,
  type RuntimeProxyPortPostRequest,
  type RuntimeProxySender,
  type RuntimeProxySendMessageRequest,
  type RuntimeProxySendMessageResult,
  type RuntimeProxyStorageCallRequest,
  type RuntimeProxyWorkerAckRequest,
  type RuntimeProxyWorkerPortDisconnectRequest,
  type RuntimeProxyWorkerPortPostRequest,
  type RuntimeProxyWorkerReplyRequest,
  type RuntimeProxyWorkerStorageChangedRequest,
} from "./bridge-protocol";
import { firstReply } from "./message-dispatch";
import { type PageContext, PageStreams } from "./page-stream";
import { type GetWebContentsFromFrame, parseSenderReport, reconstructSender } from "./sender";
import {
  isChangeVisibleToUntrustedContext,
  refuseStorageCall,
  STORAGE_UNAVAILABLE_ERROR,
  type RuntimeProxyStorageAreaName,
  type RuntimeProxyStorageCall,
  type RuntimeProxyStorageChanges,
  type RuntimeProxyStorageResult,
} from "./storage-protocol";
import {
  isTrustedStorageCaller,
  parseStorageAccessLevelReport,
  parsePageStorageChangedReport,
  parseStorageCall,
  parseStorageChangedReport,
  StorageAccessLevels,
} from "./storage-proxy";
import {
  type GetWindowCloseFallbackRejection,
  WindowCloseFallbackRejections,
} from "./window-close-rejection";
import { WorkerTabs } from "./worker-tabs";
import { createWorkerSender, WorkerToPage } from "./worker-to-page";

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
  /** Why the page-side end went away, where Chrome sets `lastError` for it. */
  error: string | undefined;
};

type StorageJob = RelayJobBase & {
  kind: "storage";
  call: RuntimeProxyStorageCall;
  /** Decided from the caller's frame when the call arrived, and kept. */
  isTrustedContext: boolean;
  settle: (result: RuntimeProxyStorageResult) => void;
  isSettled: boolean;
};

type RelayJob = SendMessageJob | ConnectJob | PortMessageJob | PortDisconnectJob | StorageJob;

type WorkerStream = {
  extensionId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  isClosed: boolean;
};

/**
 * How a port's frames reach the page side. A port a shimmed context opened has
 * a stream of its own, the response body of the `connect` that opened it; a
 * port the worker opened with `tabs.connect` has none, and rides the page
 * streams of the contexts it was bound to at connect time — every frame of the
 * target tab, or the one frame the call named.
 *
 * Binding to several contexts is Chromium's own multi-frame behavior: one port
 * on the worker's side, messages from any bound frame arriving on it, and the
 * port going away when the last of them does.
 */
type ProxyPortTransport =
  | { kind: "stream"; controller: ReadableStreamDefaultController<Uint8Array> }
  | { kind: "contexts"; contextIds: Set<string> };

type ProxyPort = {
  id: string;
  extensionId: string;
  /** The session the far end lives in, whichever side opened the port. */
  shimSession: Session;
  transport: ProxyPortTransport;
  /**
   * The page of the worker's session that opened the port with `tabs.connect`,
   * whose stream the port's traffic from the far end goes to. Absent, that
   * traffic is the worker's and rides its job stream.
   */
  openerContextId?: string;
  /**
   * The pages of the worker's session a content script's `runtime.connect`
   * reached beside the worker. Chrome keeps the opener's port open while any
   * receiving end is, so the worker hanging up ends only its own leg here.
   */
  pageLegs?: PortPageLegs;
  isClosed: boolean;
};

type PortPageLegs = {
  contextIds: Set<string>;
  isWorkerLegClosed: boolean;
  /**
   * Whether any end took the port, rather than refusing it for want of an
   * `onConnect` listener, which decides whether the opener hears Chrome's
   * "receiving end does not exist" once every end is gone.
   */
  hasConnected: boolean;
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
  /**
   * How long a message the worker aimed at a tab waits for a shimmed context
   * that has not parked its page stream yet.
   */
  waitForContextMs?: number;
  /** How a tab id resolves to the page behind it, for the worker's own calls. */
  getWebContentsById?: (tabId: number) => WebContents | undefined;
  /**
   * Whether a session took the content-script-only role, which is who the
   * worker's own `tabs.query` and `tabs.get` answer for besides its own
   * session. Without it the worker sees its own session alone, which is what
   * Chromium already gives it.
   */
  isShimmedSession?: (session: Session) => boolean;
  /**
   * Whether a page is the one its window is showing, which is Chrome's `active`
   * and only the embedder knows; `worker-tabs.ts` says why Electron's
   * focus-based answer is the wrong default for it.
   */
  isActiveTab?: (contents: WebContents) => boolean;
  /** Brings a page to the front, for `tabs.update`; `worker-tabs.ts` says when. */
  activateTab?: (contents: WebContents) => void;
  /** Which extensions `tabs.update` is answered for. */
  canUpdateTabs?: (extensionId: string) => boolean;
  /** The window a page is in, which `worker-tabs.ts` reports as a tab's `windowId`. */
  getWindowId?: (contents: WebContents) => number;
  /**
   * Which extensions have a fallback reply rewritten when the user closed a
   * window opened for the request; `window-close-rejection.ts` says why.
   * Without it every reply reaches the page as the worker sent it.
   */
  getWindowCloseFallbackRejection?: GetWindowCloseFallbackRejection;
};

/** The bridge's word on which frame made a request; `bridge/bridge.ts` has both. */
type CallerFrames = {
  senderFrame: WebFrameMain | undefined;
  navigatedSenderFrame?: WebFrameMain;
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
 *
 * The other direction — `tabs.sendMessage`, `tabs.connect` and the
 * `runtime.sendMessage` broadcast the worker starts itself — reaches a shimmed
 * context over the receive stream it parks at the bridge; `page-stream.ts`
 * keeps those and `worker-to-page.ts` carries the messages, while the ports
 * stay here with the ones a page opened. The worker's own `tabs.query` and
 * `tabs.get` are answered from main too, by `worker-tabs.ts`, for the same
 * reason: Chromium scopes both to the worker's session, where no account tab
 * lives.
 */
export class RuntimeProxy {
  private logger: ExtensionsLogger | undefined;

  private getWebContentsFromFrame: GetWebContentsFromFrame | undefined;

  private wakeTimeoutMs: number;

  private maxDeliveryAttempts: number;

  private inFlightTimeoutMs: number;

  private workerSession: Session | undefined;

  /**
   * Whether a worker session has ever been adopted, which is what tells the two
   * ways of having none apart. Before the first adoption a job waits, because
   * the session is coming; after a teardown it fails at once, because the
   * worker genuinely went away and that is what Chrome would say.
   */
  private hasAdoptedWorkerSession = false;

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

  /** The parked receive streams of the shimmed contexts, and their addressing. */
  readonly pageStreams: PageStreams;

  private workerToPage: WorkerToPage;

  /** The worker's own `tabs.query` and `tabs.get`, answered from here. */
  private workerTabs: WorkerTabs;

  private windowCloseFallbackRejections: WindowCloseFallbackRejections;

  /** What each extension's worker last said about who may reach an area. */
  private storageAccessLevels = new StorageAccessLevels();

  constructor({
    logger,
    getWebContentsFromFrame,
    getWebContentsById,
    wakeTimeoutMs = DEFAULT_WAKE_TIMEOUT_MS,
    maxDeliveryAttempts = DEFAULT_MAX_DELIVERY_ATTEMPTS,
    inFlightTimeoutMs = DEFAULT_IN_FLIGHT_TIMEOUT_MS,
    waitForContextMs,
    isShimmedSession = () => false,
    isActiveTab,
    activateTab,
    canUpdateTabs,
    getWindowId,
    getWindowCloseFallbackRejection = () => undefined,
  }: RuntimeProxyOptions = {}) {
    this.logger = logger;

    this.getWebContentsFromFrame = getWebContentsFromFrame;

    this.wakeTimeoutMs = wakeTimeoutMs;

    this.maxDeliveryAttempts = maxDeliveryAttempts;

    this.inFlightTimeoutMs = inFlightTimeoutMs;

    this.pageStreams = new PageStreams({ getWebContentsFromFrame, waitForContextMs });

    this.workerToPage = new WorkerToPage({
      pageStreams: this.pageStreams,
      getWorkerSession: () => this.workerSession,
      getWebContentsById,
      logger,
      deliveryTimeoutMs: inFlightTimeoutMs,
    });

    this.workerTabs = new WorkerTabs({
      getWorkerSession: () => this.workerSession,
      isShimmedSession,
      isActiveTab,
      activateTab,
      canUpdateTabs,
      getWebContentsById,
      getWebContentsFromFrame,
      getWindowId,
    });

    this.windowCloseFallbackRejections = new WindowCloseFallbackRejections(
      getWindowCloseFallbackRejection,
    );

    // A bound context going away takes its share of a worker-opened port with
    // it, and the last one takes the port
    this.pageStreams.onContextClosed((context) => {
      this.handlePageContextClosed(context);
    });
  }

  registerRoutes(bridge: ExtensionBridge) {
    bridge.handle(
      RUNTIME_PROXY_PATHS.sendMessage,
      ({ session, extensionId, senderFrame, navigatedSenderFrame, body, headers }) =>
        this.handleSendMessage(
          session,
          extensionId,
          { senderFrame, navigatedSenderFrame },
          body,
          headers,
        ),
    );

    bridge.handle(
      RUNTIME_PROXY_PATHS.connect,
      ({ session, extensionId, senderFrame, navigatedSenderFrame, body, headers }) =>
        this.handleConnect(
          session,
          extensionId,
          { senderFrame, navigatedSenderFrame },
          body,
          headers,
        ),
    );

    bridge.handle(RUNTIME_PROXY_PATHS.portPost, ({ session, extensionId, body, headers }) => {
      const { portId, contextId, message } = body as unknown as RuntimeProxyPortPostRequest;

      const pageLegPort = this.getPageLegPort(session, extensionId, portId, contextId);

      if (pageLegPort?.pageLegs) {
        pageLegPort.pageLegs.hasConnected = true;

        this.sendPortFrame(pageLegPort, { type: "message", message });

        return new Response(null, { status: 204, headers });
      }

      const port = this.getShimPort(session, extensionId, portId);

      if (port?.openerContextId !== undefined) {
        this.sendToOpener(port, { kind: "portMessage", portId, message });
      } else if (port) {
        this.sendToPageLegs(port, { kind: "portMessage", portId: port.id, message });

        if (!port.pageLegs?.isWorkerLegClosed) {
          this.enqueueJob(
            this.createJob(port.shimSession, extensionId, "portMessage", { portId, message }),
          );
        }
      }

      return new Response(null, { status: 204, headers });
    });

    bridge.handle(
      RUNTIME_PROXY_PATHS.portDisconnect,
      ({ session, extensionId, senderFrame, body, headers }) => {
        const { portId, contextId, reason } = body as unknown as RuntimeProxyPortDisconnectRequest;

        const pageLegPort = this.getPageLegPort(session, extensionId, portId, contextId);

        if (pageLegPort && typeof contextId === "string") {
          this.endPageLeg(pageLegPort, contextId, { isRefusal: reason === "noListener" });

          return new Response(null, { status: 204, headers });
        }

        const port = this.getShimPort(session, extensionId, portId);

        if (port) {
          this.disconnectShimPort(port, {
            session,
            extensionId,
            senderFrame,
            contextId,
            // The page names the case; the words the worker reads are this
            // process's own
            error: reason === "noListener" ? RECEIVING_END_ERROR : undefined,
          });
        }

        return new Response(null, { status: 204, headers });
      },
    );

    bridge.handle(
      RUNTIME_PROXY_PATHS.storageCall,
      ({ session, extensionId, senderFrame, body, headers }) =>
        this.handleStorageCall(session, extensionId, senderFrame, body, headers),
    );

    bridge.handle(
      RUNTIME_PROXY_PATHS.workerStorageAccessLevel,
      ({ session, extensionId, body, headers }) => {
        const report = parseStorageAccessLevelReport(body);

        if (session === this.workerSession && report) {
          this.storageAccessLevels.set(extensionId, report.area, report.accessLevel);
        }

        return new Response(null, { status: session === this.workerSession ? 204 : 403, headers });
      },
    );

    bridge.handle(
      RUNTIME_PROXY_PATHS.workerStorageChanged,
      ({ session, extensionId, body, headers }) => {
        if (session !== this.workerSession) {
          return new Response(null, { status: 403, headers });
        }

        const report = parseStorageChangedReport(body);

        if (report) {
          this.fanOutStorageChange(extensionId, report);
        }

        return new Response(null, { status: 204, headers });
      },
    );

    bridge.handle(
      RUNTIME_PROXY_PATHS.pageStorageChanged,
      ({ session, extensionId, senderFrame, body, headers }) => {
        if (
          session !== this.workerSession ||
          !senderFrame?.url.startsWith(`${EXTENSION_SCHEME_PREFIX}${extensionId}/`)
        ) {
          return new Response(null, { status: 403, headers });
        }

        const report = parsePageStorageChangedReport(body);

        if (report) {
          this.sendPageStorageChange(extensionId, report);
        }

        return new Response(null, { status: 204, headers });
      },
    );

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
            this.endWorkerLeg(port);
          }
        }

        return new Response(null, { status: session === this.workerSession ? 204 : 403, headers });
      },
    );

    bridge.handle(
      RUNTIME_PROXY_PATHS.workerConnectToTab,
      ({ session, extensionId, body, headers }) => {
        if (session !== this.workerSession) {
          return new Response(null, { status: 403, headers });
        }

        return this.handleWorkerConnectToTab(extensionId, body, headers);
      },
    );

    // The rest of what the worker starts, and the streams it reaches pages on
    this.workerToPage.registerRoutes(bridge);

    this.workerTabs.registerRoutes(bridge);

    this.pageStreams.registerRoutes(bridge, {
      isShimmedSession: (session) =>
        this.workerSession !== undefined && session !== this.workerSession,
      isWorkerSession: (session) => session === this.workerSession,
    });
  }

  /**
   * A port the worker opened with `tabs.connect`, bound to the contexts of the
   * target tab. The port record is kept here with every other, so a bound
   * context posting on it and the worker posting back both take the paths the
   * page-opened ports already use.
   *
   * A page of the worker's session opens one the same way, naming the context
   * it parked as, which is where the far end's traffic then goes instead of
   * the worker.
   */
  private async handleWorkerConnectToTab(
    extensionId: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const request = body as unknown as RuntimeProxyWorkerConnectToTabRequest;

    if (typeof request.portId !== "string" || this.ports.has(request.portId)) {
      return new Response(null, { status: 400, headers });
    }

    let openerContextId: string | undefined;

    if (request.contextId !== undefined) {
      const opener =
        typeof request.contextId === "string"
          ? this.pageStreams.getContext(request.contextId)
          : undefined;

      if (!opener || !opener.isInWorkerSession || opener.extensionId !== extensionId) {
        return new Response(null, { status: 400, headers });
      }

      openerContextId = opener.contextId;
    }

    const resolution = await this.workerToPage.resolveTabTarget(extensionId, request);

    if (resolution.status !== "contexts") {
      return Response.json(resolution satisfies RuntimeProxyWorkerConnectToTabResult, { headers });
    }

    const [firstContext] = resolution.contexts;

    if (!firstContext) {
      return Response.json(
        { status: "noListener" } satisfies RuntimeProxyWorkerConnectToTabResult,
        {
          headers,
        },
      );
    }

    const contextIds = new Set<string>();

    const name = typeof request.name === "string" ? request.name : undefined;

    const port: ProxyPort = {
      id: request.portId,
      extensionId,
      // Every context of one tab is of one session, so the port's far end is
      // the session the first of them is in
      shimSession: firstContext.session,
      transport: { kind: "contexts", contextIds },
      openerContextId,
      isClosed: false,
    };

    // A page is a document with a URL of its own, which Chrome's sender carries
    const sender = createWorkerSender(
      extensionId,
      openerContextId === undefined ? undefined : request.workerUrl,
    );

    for (const context of resolution.contexts) {
      if (
        this.pageStreams.send(context, {
          kind: "connect",
          portId: port.id,
          name,
          sender,
        })
      ) {
        contextIds.add(context.contextId);
      }
    }

    if (contextIds.size === 0) {
      return Response.json(
        { status: "noListener" } satisfies RuntimeProxyWorkerConnectToTabResult,
        {
          headers,
        },
      );
    }

    this.ports.set(port.id, port);

    return Response.json({ status: "connected" } satisfies RuntimeProxyWorkerConnectToTabResult, {
      headers,
    });
  }

  private handlePageContextClosed(context: PageContext) {
    for (const port of this.ports.values()) {
      if (port.pageLegs?.contextIds.has(context.contextId)) {
        this.endPageLeg(port, context.contextId, { isRefusal: false });

        continue;
      }

      // The page that opened it is gone, which Chrome reports to the far end as
      // the port going away
      if (port.openerContextId === context.contextId) {
        this.closeShimPort(port, { notifyWorker: false });

        continue;
      }

      if (
        port.transport.kind !== "contexts" ||
        !port.transport.contextIds.delete(context.contextId)
      ) {
        continue;
      }

      // The worker's port stays open while any bound frame is still there,
      // which is what Chrome's multi-frame port does
      if (port.transport.contextIds.size === 0) {
        this.closeShimPort(port, { notifyWorker: true });
      }
    }
  }

  /**
   * The session that keeps the workers. Its `running-status-changed` events are
   * what invalidate parked job streams, since nothing else says a worker died.
   *
   * Anything queued before this arrives is driven again here, which is the
   * other half of `wakeWorker` waiting rather than refusing when it has no
   * session: a wake armed without one has no `startWorkerForScope` behind it,
   * so it is cleared before the queue is driven, or the real wake would return
   * early against it and the jobs would wait out a timeout for a worker nobody
   * asked to start.
   */
  setWorkerSession(session: Session) {
    this.removeWorkerSessionListener?.();

    this.workerSession = session;

    this.hasAdoptedWorkerSession = true;

    const statusListener = (details: { versionId: number; runningStatus: string }) => {
      this.handleRunningStatusChanged(details.versionId, details.runningStatus);
    };

    session.serviceWorkers.on("running-status-changed", statusListener);

    this.removeWorkerSessionListener = () => {
      session.serviceWorkers.removeListener("running-status-changed", statusListener);

      this.removeWorkerSessionListener = undefined;
    };

    for (const extensionId of this.wakes.keys()) {
      this.clearWake(extensionId);
    }

    for (const [extensionId, queue] of this.queuedJobs) {
      if (queue.length > 0) {
        this.ensureDelivery(extensionId);
      }
    }
  }

  teardownSession(session: Session) {
    if (session === this.workerSession) {
      this.pageStreams.teardownSession(session);

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

      // The levels described a store that went away with the session
      this.storageAccessLevels.clear();

      return;
    }

    this.pageStreams.teardownSession(session);

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
    caller: CallerFrames,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const request = body as unknown as RuntimeProxySendMessageRequest;

    const report = parseSenderReport(request.sender);

    if (!report || session === this.workerSession) {
      return new Response(null, { status: 400, headers });
    }

    const sender = this.reconstructSender(session, extensionId, report, caller);

    // Before the job is queued, since a window the worker opens in answer to
    // the request is what ties it to the request
    const pendingRequest = this.windowCloseFallbackRejections.track(extensionId, request.message);

    const toWorker = new Promise<RuntimeProxySendMessageResult>((resolve) => {
      const job = this.createJob(session, extensionId, "sendMessage", {
        message: request.message,
        sender,
        settle: resolve,
        isSettled: false,
      });

      this.enqueueJob(job);
    });

    // Chrome delivers it to every frame of the extension as well as the worker,
    // and Chromium cannot reach the worker session's pages from here: a popup
    // in a window collecting a tab's page details hears the content script's
    // answer this way. The first `sendResponse` wins, as between any two frames
    const toWorkerSessionPages = this.workerToPage.deliverToContexts(
      this.pageStreams.workerSessionPageContexts(extensionId),
      request.message,
      sender,
      { isBesideWorker: true },
    );

    const result = await firstReply([toWorker, toWorkerSessionPages]);

    if (!pendingRequest) {
      return Response.json(result, { headers });
    }

    const settledResult = this.windowCloseFallbackRejections.settle(pendingRequest, result);

    if (settledResult !== result) {
      this.logger?.info("Rejected a fallback asked for after the user closed an extension window", {
        extensionId,
        command: (request.message as { command?: unknown }).command,
      });
    }

    return Response.json(settledResult, { headers });
  }

  /** A window the loader opened for an extension, as `windows/windows.ts` reports it. */
  extensionWindowOpened(extensionId: string, windowId: number) {
    this.windowCloseFallbackRejections.windowOpened(extensionId, windowId);
  }

  /** A window the loader opened that closed other than through the extension's own calls. */
  extensionWindowClosedByUser(extensionId: string, windowId: number) {
    this.windowCloseFallbackRejections.windowClosedByUser(extensionId, windowId);
  }

  /**
   * One `chrome.storage` call from a shimmed context, refused here or handed
   * to the worker as a job like any other — same queue, same wake of a stopped
   * worker, same ack and redelivery, same in-flight backstop.
   *
   * The two refusals are Chromium's own and have to be made here rather than
   * in the worker: the call is answered in a privileged context, which
   * Chromium would never refuse, so the check a content script would have met
   * natively is applied before the call is relayed at all.
   */
  private async handleStorageCall(
    session: Session,
    extensionId: string,
    senderFrame: WebFrameMain | undefined,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const request = body as unknown as RuntimeProxyStorageCallRequest;

    const call = parseStorageCall(request.call);

    if (!call || !parseSenderReport(request.sender) || session === this.workerSession) {
      return new Response(null, { status: 400, headers });
    }

    const isTrustedContext = isTrustedStorageCaller(extensionId, senderFrame);

    const refusal = this.refuseStorage(extensionId, call, isTrustedContext);

    if (refusal !== undefined) {
      return Response.json({ status: "error", message: refusal }, { headers });
    }

    const result = await new Promise<RuntimeProxyStorageResult>((resolve) => {
      this.enqueueJob(
        this.createJob(session, extensionId, "storage", {
          call,
          isTrustedContext,
          settle: resolve,
          isSettled: false,
        }),
      );
    });

    return Response.json(result, { headers });
  }

  private refuseStorage(
    extensionId: string,
    call: RuntimeProxyStorageCall,
    isTrustedContext: boolean,
  ) {
    return refuseStorageCall(
      call,
      isTrustedContext,
      this.storageAccessLevels.get(extensionId, call.area),
    );
  }

  /**
   * One change of the worker's store, out to every parked context of the
   * extension — which is what Chrome does with `onChanged`, firing it in every
   * context including the one whose write caused it.
   *
   * Content scripts are held to the same access level a read would be, so a
   * `session` or `local` area the extension closed does not leak through its
   * events what it refuses to a `get`. Both records of the level decide it, the
   * worker's travelling with the change and main's being this one, since
   * neither is reliably the newer.
   */
  private fanOutStorageChange(
    extensionId: string,
    { area, changes, accessLevel }: RuntimeProxyWorkerStorageChangedRequest,
  ) {
    const isVisibleToUntrustedContext = isChangeVisibleToUntrustedContext(
      accessLevel,
      this.storageAccessLevels.get(extensionId, area),
    );

    this.pageStreams.broadcast(
      extensionId,
      { kind: "storageChanged", area, changes },
      isVisibleToUntrustedContext
        ? undefined
        : (context) => isTrustedStorageCaller(context.extensionId, context.frame),
    );
  }

  private handleConnect(
    session: Session,
    extensionId: string,
    caller: CallerFrames,
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
          transport: { kind: "stream", controller },
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

    const name = typeof request.name === "string" ? request.name : undefined;

    const sender = this.reconstructSender(session, extensionId, report, caller);

    this.enqueueJob(
      this.createJob(session, extensionId, "connect", { portId: request.portId, name, sender }),
    );

    // Chrome opens it to every frame of the extension as well as the worker,
    // as with `runtime.sendMessage`, and Chromium cannot reach the worker
    // session's pages from here
    if (port) {
      const pageLegs = new Set<string>();

      for (const context of this.pageStreams.workerSessionPageContexts(extensionId)) {
        if (this.pageStreams.send(context, { kind: "connect", portId: port.id, name, sender })) {
          pageLegs.add(context.contextId);
        }
      }

      if (pageLegs.size > 0) {
        port.pageLegs = { contextIds: pageLegs, isWorkerLegClosed: false, hasConnected: false };
      }
    }

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

  /**
   * Hands a page's change to the worker on its parked stream, outside the job
   * bookkeeping: there is no reply to wait for, and a change that finds no
   * stream is dropped rather than queued, because a worker that is not running
   * reads the store afresh when it starts and so already has it. The worker
   * acks it like any job, and the ack, naming no job here, is ignored.
   */
  private sendPageStorageChange(
    extensionId: string,
    { area, changes }: { area: RuntimeProxyStorageAreaName; changes: RuntimeProxyStorageChanges },
  ) {
    const stream = this.workerStreams.get(extensionId);

    if (!stream || stream.isClosed) {
      return;
    }

    try {
      stream.controller.enqueue(
        encodeNativeMessage({
          type: "storageChanged",
          jobId: randomUUID(),
          area,
          changes,
        } satisfies RuntimeProxyJob),
      );
    } catch {
      this.invalidateWorkerStream(extensionId);
    }
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

    if (job.kind === "storage") {
      const storageResult = result as RuntimeProxyStorageResult;

      this.settleStorage(
        job,
        storageResult?.status === "ok" || storageResult?.status === "error"
          ? storageResult
          : { status: "error", message: STORAGE_UNAVAILABLE_ERROR },
      );

      return;
    }

    if (job.kind === "connect") {
      const connectResult = result as RuntimeProxyConnectResult;

      const port = this.ports.get(job.portId);

      if (port && connectResult?.status === "connected") {
        if (port.pageLegs) {
          port.pageLegs.hasConnected = true;
        }
      } else if (port) {
        this.endWorkerLeg(port, { error: RECEIVING_END_ERROR });
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

    const requeuedJobs: RelayJob[] = [];

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

      requeuedJobs.push(job);
    }

    // At the front, in the order they were handed over: a job that reached a
    // stream always predates anything still queued, since the queue only fills
    // while no stream is parked and a parked stream is flushed synchronously.
    // A port's messages must not overtake the connect that opens it, and the
    // shim can have both in flight at once — its `connect` resolves on the
    // bridge's answer, which is given before the worker has seen the job
    this.queue(extensionId).unshift(...requeuedJobs);

    const requeuedConnectPortIds = new Set(
      this.queue(extensionId)
        .filter((job) => job.kind === "connect")
        .map((job) => (job as ConnectJob).portId),
    );

    // A port a page opened was never the worker's, and outlives it
    for (const port of this.ports.values()) {
      if (
        port.extensionId === extensionId &&
        port.openerContextId === undefined &&
        !requeuedConnectPortIds.has(port.id)
      ) {
        this.endWorkerLeg(port);
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

    const jobs = queue.splice(0);

    for (const [index, job] of jobs.entries()) {
      /*
       * A job that waited for a worker to wake waited across the worker's own
       * startup, and its `setAccessLevel` may have arrived in between — so the
       * level the call was measured against when it arrived is not necessarily
       * the level in force now. The worker checks again at dispatch against a
       * record that cannot be stale; this is the early refusal, which keeps a
       * call that cannot succeed from reaching it at all.
       */
      if (job.kind === "storage") {
        const refusal = this.refuseStorage(job.extensionId, job.call, job.isTrustedContext);

        if (refusal !== undefined) {
          this.settleStorage(job, { status: "error", message: refusal });

          continue;
        }
      }

      job.state = "handed";

      job.attempts += 1;

      this.inFlightJobs.set(job.jobId, job);

      this.startInFlightTimer(job);

      try {
        stream.controller.enqueue(encodeNativeMessage(this.toJobFrame(job)));
      } catch {
        // The stream stopped taking frames under us; its worker is gone. The
        // jobs after this one were handed to nobody and are in neither the
        // queue nor `inFlightJobs`, so they go back before the invalidation —
        // which settles this one from `inFlightJobs`, puts it back ahead of
        // them, and reads the queue to tell a port whose connect is waiting
        // from one that has to be closed
        queue.push(...jobs.slice(index + 1));

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
   *
   * With no worker session yet there is nothing to call it on, and the jobs
   * wait out a bounded timeout instead. That window is the launch one the
   * embedder's ordering already closes — the worker session is set up before
   * any session that could message it — so what this buys is that a window
   * which should never open costs a wait rather than a wrong answer.
   * `setWorkerSession` drives the queue the way a parked stream does, and only
   * a timer expiring answers "receiving end does not exist", which is the same
   * shape the cold-launch race settled on for a registration that has not been
   * stored yet. The worst case is two of these timeouts rather than one: this
   * timer, and then the one armed after the adoption's own
   * `startWorkerForScope`.
   *
   * Jobs only. A page stream parked in the same window is refused, since
   * `isShimmedSession` is false for every session while there is no worker
   * session to hold one against, and the context re-parks on its own backoff.
   * The window is the same unreachable one, and closing that half would be a
   * change to how streams are parked rather than to how jobs are queued.
   */
  private wakeWorker(extensionId: string) {
    if (this.wakes.has(extensionId)) {
      return;
    }

    const workerSession = this.workerSession;

    const wake: Wake = { timer: undefined };

    this.wakes.set(extensionId, wake);

    if (!workerSession) {
      // A worker session that went away is Chrome's missing receiving end and
      // is answered as one; one that has not arrived yet is a window the
      // embedder's ordering already closes, and the jobs wait it out
      if (this.hasAdoptedWorkerSession) {
        this.clearWake(extensionId);

        this.failQueuedJobs(extensionId, "noListener");

        return;
      }

      this.logger?.info("No extension worker session yet; waiting for one to be adopted", {
        extensionId,
      });

      this.armWakeTimeout(extensionId, wake);

      return;
    }

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

        this.armWakeTimeout(extensionId, wake);
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

        this.armWakeTimeout(extensionId, wake);
      });
  }

  /**
   * How long a queued job waits for the stream a worker parks once it is
   * running. Expiring is the one path that answers "receiving end does not
   * exist" for a job that was queued rather than refused outright.
   */
  private armWakeTimeout(extensionId: string, wake: Wake) {
    wake.timer = setTimeout(() => {
      this.wakes.delete(extensionId);

      this.failQueuedJobs(extensionId, "noListener");
    }, this.wakeTimeoutMs);
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

    // Neither of Chrome's messaging failures means anything to a storage
    // call: what the caller has to hear is that the store was not reached
    if (job.kind === "storage") {
      this.settleStorage(job, { status: "error", message: STORAGE_UNAVAILABLE_ERROR });

      return;
    }

    const port = this.ports.get(job.portId);

    if (!port) {
      return;
    }

    if (job.kind === "connect") {
      this.endWorkerLeg(port, {
        error: failure === "noListener" ? RECEIVING_END_ERROR : PORT_CLOSED_ERROR,
      });

      return;
    }

    // An undeliverable port job means the port's far end is gone for good
    this.endWorkerLeg(port);
  }

  /**
   * The worker's end of a port is gone. That closes the port, unless a content
   * script's `runtime.connect` also reached pages of the worker's session that
   * still hold it, in which case only the worker's leg ends, as in Chrome.
   */
  private endWorkerLeg(port: ProxyPort, { error }: { error?: string } = {}) {
    const legs = port.pageLegs;

    if (!legs) {
      this.closeShimPort(port, { notifyWorker: false, error });

      return;
    }

    legs.isWorkerLegClosed = true;

    if (legs.contextIds.size === 0) {
      this.closeShimPort(port, {
        notifyWorker: false,
        error: legs.hasConnected ? undefined : error,
      });
    }
  }

  /**
   * One page's end of a port a content script opened. The port closes with the
   * last end, the worker's included, and the opener hears "receiving end does
   * not exist" only when every end refused it.
   */
  private endPageLeg(port: ProxyPort, contextId: string, { isRefusal }: { isRefusal: boolean }) {
    const legs = port.pageLegs;

    if (!legs?.contextIds.delete(contextId)) {
      return;
    }

    if (!isRefusal) {
      legs.hasConnected = true;
    }

    if (legs.contextIds.size === 0 && legs.isWorkerLegClosed) {
      this.closeShimPort(port, {
        notifyWorker: false,
        error: legs.hasConnected ? undefined : RECEIVING_END_ERROR,
      });
    }
  }

  /**
   * A port a content script opened that this page of the worker's session is
   * one end of, named by the context the page parked as.
   */
  private getPageLegPort(
    session: Session,
    extensionId: string,
    portId: unknown,
    contextId: unknown,
  ) {
    if (session !== this.workerSession || typeof portId !== "string") {
      return undefined;
    }

    const port = this.ports.get(portId);

    const context =
      typeof contextId === "string" ? this.pageStreams.getContext(contextId) : undefined;

    if (
      !port ||
      port.isClosed ||
      port.extensionId !== extensionId ||
      !context ||
      context.session !== session ||
      context.extensionId !== extensionId ||
      !port.pageLegs?.contextIds.has(context.contextId)
    ) {
      return undefined;
    }

    return port;
  }

  private sendToPageLegs(port: ProxyPort, envelope: RuntimeProxyPageEnvelope) {
    for (const contextId of port.pageLegs?.contextIds ?? []) {
      const context = this.pageStreams.getContext(contextId);

      if (context) {
        this.pageStreams.send(context, envelope);
      }
    }
  }

  private settleSendMessage(job: SendMessageJob, result: RuntimeProxySendMessageResult) {
    if (job.isSettled) {
      return;
    }

    job.isSettled = true;

    this.removeInFlightJob(job);

    job.settle(result);
  }

  private settleStorage(job: StorageJob, result: RuntimeProxyStorageResult) {
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

  /**
   * One page-side end of a port hanging up. A port the worker opened may be
   * bound to several frames of a tab, where Chrome keeps the port alive while
   * any of them is still there, so a frame's disconnect unbinds that frame and
   * only the last one closes the port. A port a page opened has the one end.
   */
  private disconnectShimPort(
    port: ProxyPort,
    {
      session,
      extensionId,
      senderFrame,
      contextId,
      error,
    }: {
      session: Session;
      extensionId: string;
      senderFrame: WebFrameMain | undefined;
      contextId: string | undefined;
      error: string | undefined;
    },
  ) {
    if (port.transport.kind !== "contexts") {
      this.closeShimPort(port, { notifyWorker: true, error });

      return;
    }

    const { contextIds } = port.transport;

    // The context names itself from what the relay told it when it parked,
    // which is what makes the unbinding independent of the caller stamp — a
    // stamp evicted under a burst would otherwise leave the port bound to a
    // frame that has already dropped it
    const named = contextId === undefined ? undefined : this.pageStreams.getContext(contextId);

    if (named && named.session === session && named.extensionId === extensionId) {
      contextIds.delete(named.contextId);
    } else {
      for (const boundContextId of contextIds) {
        if (this.pageStreams.getContext(boundContextId)?.frame === senderFrame) {
          contextIds.delete(boundContextId);
        }
      }
    }

    // Chrome's port outlives every frame of the tab but the last
    if (contextIds.size === 0) {
      this.closeShimPort(port, { notifyWorker: true, error });
    }
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

    if (port.transport.kind === "stream") {
      try {
        port.transport.controller.close();
      } catch {
        // The stream is already gone when the shim's side canceled it
      }
    }

    // Whatever closed it, an end still holding it has to hear so
    this.sendToPageLegs(port, { kind: "portDisconnect", portId: port.id, error });

    if (notifyWorker && port.openerContextId !== undefined) {
      this.sendToOpener(port, { kind: "portDisconnect", portId: port.id, error });

      return;
    }

    if (notifyWorker && !wasConnectQueued && !port.pageLegs?.isWorkerLegClosed) {
      this.enqueueJob(
        this.createJob(port.shimSession, port.extensionId, "portDisconnect", {
          portId: port.id,
          error,
        }),
      );
    }
  }

  /** A frame to the page of the worker's session that opened the port. */
  private sendToOpener(port: ProxyPort, envelope: RuntimeProxyPageEnvelope) {
    const opener =
      port.openerContextId === undefined
        ? undefined
        : this.pageStreams.getContext(port.openerContextId);

    if (opener) {
      this.pageStreams.send(opener, envelope);
    }
  }

  /**
   * A frame to the page side of a port, over whichever transport the port has:
   * its own stream when a shimmed context opened it, and the page streams of
   * the bound contexts when the worker did.
   */
  private sendPortFrame(port: ProxyPort, frame: RuntimeProxyPortFrame) {
    if (port.transport.kind === "contexts") {
      for (const contextId of port.transport.contextIds) {
        const context = this.pageStreams.getContext(contextId);

        if (context) {
          this.pageStreams.send(
            context,
            frame.type === "message"
              ? { kind: "portMessage", portId: port.id, message: frame.message }
              : { kind: "portDisconnect", portId: port.id, error: frame.error },
          );
        }
      }

      return;
    }

    try {
      port.transport.controller.enqueue(encodeNativeMessage(frame));
    } catch {
      // The stream no longer accepts frames when the shim's side canceled it
    }
  }

  private reconstructSender(
    session: Session,
    extensionId: string,
    report: { url: string; isTopFrame: boolean },
    { senderFrame, navigatedSenderFrame }: CallerFrames,
  ) {
    return reconstructSender({
      session,
      extensionId,
      report,
      senderFrame,
      navigatedSenderFrame,
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
        return {
          type: "portDisconnect",
          jobId: job.jobId,
          portId: job.portId,
          error: job.error,
        };
      case "storage":
        return {
          type: "storage",
          jobId: job.jobId,
          call: job.call,
          isTrustedContext: job.isTrustedContext,
        };
    }
  }
}
