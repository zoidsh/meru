import { randomUUID } from "node:crypto";
import type { Session, WebContents } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import type { ExtensionsLogger } from "../logger";
import { getExtensionFrameId } from "../web-navigation/web-navigation";
import {
  EXTENSION_SCHEME_PREFIX,
  noDocumentError,
  noFrameError,
  noTabError,
  type RuntimeProxyPageEnvelope,
  type RuntimeProxySender,
  type RuntimeProxySendMessageResult,
  type RuntimeProxyTabTarget,
  type RuntimeProxyWorkerBroadcastRequest,
  type RuntimeProxyWorkerSendToTabRequest,
  type RuntimeProxyWorkerSendToTabResult,
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyPageReplyRequest,
} from "./bridge-protocol";
import { firstReply } from "./message-dispatch";
import type { PageContext, PageStreams } from "./page-stream";

/**
 * Resolved at call time: a value import of "electron" cannot even be loaded
 * outside Electron, which is where this module's tests run.
 */
function getElectronWebContentsById(tabId: number) {
  const { webContents } = require("electron") as typeof import("electron");

  return webContents.fromId(tabId);
}

/**
 * The sender a shimmed listener sees for anything the worker sent: the
 * extension itself. Chrome gives a content script hearing from its own
 * extension an id and an origin and no `tab`, there being no page behind a
 * service worker.
 */
export function createWorkerSender(extensionId: string): RuntimeProxySender {
  return { id: extensionId, origin: `${EXTENSION_SCHEME_PREFIX}${extensionId}` };
}

/**
 * Where a call the worker aimed at a tab ended up. `contexts` may be empty,
 * which is a tab that is really there with nothing of the extension listening
 * in it — Chrome's missing receiving end rather than its missing tab.
 */
export type TabTargetResolution =
  | { status: "contexts"; contexts: PageContext[] }
  | { status: "ownSession" }
  | { status: "noTarget"; error: string };

type PageDelivery = {
  deliveryId: string;
  context: PageContext;
  settle: (result: RuntimeProxySendMessageResult) => void;
  isSettled: boolean;
  timer: ReturnType<typeof setTimeout>;
};

export type WorkerToPageOptions = {
  pageStreams: PageStreams;
  /** The session keeping the worker, which is the one the relay never delivers into. */
  getWorkerSession: () => Session | undefined;
  /** How a tab id resolves to the page behind it, Electron's own mapping by default. */
  getWebContentsById?: (tabId: number) => WebContents | undefined;
  logger?: ExtensionsLogger;
  /**
   * How long a context may hold a message without answering before it fails
   * the way Chrome's closed message port does.
   */
  deliveryTimeoutMs?: number;
};

/**
 * The same backstop, and for the same reason, as the worker direction's: no
 * deadline on an answer, only a bound on the wedge — here a renderer that took
 * a message and will never answer it, whose page stream nothing has closed.
 */
const DEFAULT_DELIVERY_TIMEOUT_MS = 5 * 60_000;

/**
 * The half of the relay that carries what the worker starts: its
 * `tabs.sendMessage` into another session's content scripts, and its
 * `runtime.sendMessage` broadcast to the extension's own pages wherever they
 * are. Both reach a shimmed context over the page stream it has parked
 * (`page-stream.ts`); ports the worker opens are `runtime-proxy.ts`'s, since
 * they are the same port records the other direction already keeps.
 *
 * Routing is main's alone to know. The worker's relay client cannot tell which
 * session a tab id belongs to, so it hands every `tabs.sendMessage` here and is
 * told `ownSession` for a tab of its own session, where Chromium's native
 * messaging works and the relay has no business — the client then makes the
 * native call it would have made. That costs one in-process round trip on the
 * worker session's own tabs and keeps the session map in the one process that
 * has it.
 *
 * Delivery is not acked, where the worker direction acks every job. An ack
 * there tells a job the worker died holding apart from one that never arrived,
 * so the second can be handed to the worker's next stream — but a page context
 * has no next stream. It never comes back: the frame is gone, and with it the
 * only thing the message was for. So a delivery ends in the context's reply, in
 * its stream closing, or in the backstop, and there is nothing an ack would add
 * but a POST per message.
 */
export class WorkerToPage {
  private pageStreams: PageStreams;

  private getWorkerSession: () => Session | undefined;

  private getWebContentsById: (tabId: number) => WebContents | undefined;

  private logger: ExtensionsLogger | undefined;

  private deliveryTimeoutMs: number;

  private deliveries = new Map<string, PageDelivery>();

  constructor({
    pageStreams,
    getWorkerSession,
    getWebContentsById = getElectronWebContentsById,
    logger,
    deliveryTimeoutMs = DEFAULT_DELIVERY_TIMEOUT_MS,
  }: WorkerToPageOptions) {
    this.pageStreams = pageStreams;

    this.getWorkerSession = getWorkerSession;

    this.getWebContentsById = getWebContentsById;

    this.logger = logger;

    this.deliveryTimeoutMs = deliveryTimeoutMs;

    // A context that goes away owes its deliveries an answer, which is the
    // message port closing under the message rather than a missing listener
    this.pageStreams.onContextClosed((context) => {
      for (const delivery of this.deliveries.values()) {
        if (delivery.context === context) {
          this.settleDelivery(delivery, { status: "closed" });
        }
      }
    });
  }

  registerRoutes(bridge: ExtensionBridge) {
    bridge.handle(
      RUNTIME_PROXY_PATHS.workerSendToTab,
      async ({ session, extensionId, body, headers }) => {
        if (session !== this.getWorkerSession()) {
          return new Response(null, { status: 403, headers });
        }

        const request = body as unknown as RuntimeProxyWorkerSendToTabRequest;

        const resolution = await this.resolveTabTarget(extensionId, request);

        if (resolution.status !== "contexts") {
          return Response.json(resolution satisfies RuntimeProxyWorkerSendToTabResult, { headers });
        }

        const result = await this.deliverToContexts(
          resolution.contexts,
          request.message,
          createWorkerSender(extensionId),
        );

        return Response.json(result satisfies RuntimeProxyWorkerSendToTabResult, { headers });
      },
    );

    bridge.handle(
      RUNTIME_PROXY_PATHS.workerBroadcast,
      async ({ session, extensionId, body, headers }) => {
        if (session !== this.getWorkerSession()) {
          return new Response(null, { status: 403, headers });
        }

        const { message } = body as unknown as RuntimeProxyWorkerBroadcastRequest;

        const result = await this.deliverToContexts(
          this.pageStreams.extensionPageContexts(extensionId),
          message,
          createWorkerSender(extensionId),
        );

        return Response.json(result, { headers });
      },
    );

    bridge.handle(RUNTIME_PROXY_PATHS.pageReply, ({ session, extensionId, body, headers }) => {
      const { deliveryId, result } = body as unknown as RuntimeProxyPageReplyRequest;

      const delivery = this.deliveries.get(typeof deliveryId === "string" ? deliveryId : "");

      // The id was minted here and streamed to that one context, but the check
      // costs nothing and keeps a session from answering another's delivery
      if (
        delivery &&
        delivery.context.session === session &&
        delivery.context.extensionId === extensionId
      ) {
        this.settleDelivery(
          delivery,
          result?.status === "replied" || result?.status === "noListener"
            ? result
            : { status: "closed" },
        );
      }

      return new Response(null, { status: 204, headers });
    });
  }

  /**
   * Which contexts a `tabs.sendMessage` or `tabs.connect` is for, or why it is
   * for none of them. A tab of the worker's own session is answered
   * `ownSession` before anything else is looked at, since the relay must not
   * shadow what Chromium already does natively there.
   */
  async resolveTabTarget(
    extensionId: string,
    target: RuntimeProxyTabTarget,
  ): Promise<TabTargetResolution> {
    const { tabId, frameId, documentId } = target;

    if (typeof tabId !== "number") {
      return { status: "noTarget", error: noTabError(tabId) };
    }

    const contents = this.getWebContentsById(tabId);

    if (!contents || contents.isDestroyed()) {
      return { status: "noTarget", error: noTabError(tabId) };
    }

    if (contents.session === this.getWorkerSession()) {
      return { status: "ownSession" };
    }

    // Nothing here can mint a document id an extension would recognize, so one
    // that is asked for matches nothing, and says so the way Chrome says it
    if (documentId !== undefined) {
      return { status: "noTarget", error: noDocumentError(documentId, tabId) };
    }

    if (frameId !== undefined && typeof frameId !== "number") {
      return { status: "noTarget", error: noFrameError(frameId, tabId) };
    }

    const contexts = await this.pageStreams.waitForTabContexts(extensionId, tabId, frameId);

    // A named frame that has no context may be a frame with nothing of the
    // extension in it, or no frame at all, and Chrome tells those apart
    if (contexts.length === 0 && frameId !== undefined && !this.hasFrame(contents, frameId)) {
      return { status: "noTarget", error: noFrameError(frameId, tabId) };
    }

    return { status: "contexts", contexts };
  }

  private deliverToContexts(contexts: PageContext[], message: unknown, sender: RuntimeProxySender) {
    return firstReply(contexts.map((context) => this.deliverToContext(context, message, sender)));
  }

  private deliverToContext(context: PageContext, message: unknown, sender: RuntimeProxySender) {
    return new Promise<RuntimeProxySendMessageResult>((resolve) => {
      const deliveryId = randomUUID();

      const envelope: RuntimeProxyPageEnvelope = { kind: "message", deliveryId, message, sender };

      const delivery: PageDelivery = {
        deliveryId,
        context,
        settle: resolve,
        isSettled: false,
        timer: setTimeout(() => {
          this.logger?.error("A shimmed context never answered a relayed message", {
            extensionId: context.extensionId,
            url: context.url,
          });

          this.settleDelivery(delivery, { status: "closed" });
        }, this.deliveryTimeoutMs),
      };

      this.deliveries.set(deliveryId, delivery);

      if (!this.pageStreams.send(context, envelope)) {
        this.settleDelivery(delivery, { status: "noListener" });
      }
    });
  }

  private settleDelivery(delivery: PageDelivery, result: RuntimeProxySendMessageResult) {
    if (delivery.isSettled) {
      return;
    }

    delivery.isSettled = true;

    clearTimeout(delivery.timer);

    this.deliveries.delete(delivery.deliveryId);

    delivery.settle(result);
  }

  /** Whether the tab still has the frame, told the way webNavigation tells it. */
  private hasFrame(contents: WebContents, frameId: number) {
    return contents.mainFrame.framesInSubtree.some(
      (frame) => !frame.isDestroyed() && getExtensionFrameId(frame) === frameId,
    );
  }
}
