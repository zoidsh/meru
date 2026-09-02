import { randomUUID } from "node:crypto";
import type { Session, WebFrameMain } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import { encodeNativeMessage } from "../native-messaging/framing";
import {
  EXTENSION_SCHEME_PREFIX,
  type RuntimeProxyPageEnvelope,
  type RuntimeProxyPageStreamRequest,
  RUNTIME_PROXY_PATHS,
} from "./bridge-protocol";
import { type GetWebContentsFromFrame, parseSenderReport, reconstructSender } from "./sender";

/**
 * A shimmed context with a stream parked, and what the main process may address
 * it by. The frame is the identity: it is what the bridge recorded as the
 * request's caller, and it is what says whether the context is still there.
 */
export type PageContext = {
  contextId: string;
  session: Session;
  extensionId: string;
  frame: WebFrameMain;
  /** The hosting tab's `WebContents` id, absent for a top-level extension page. */
  tabId: number | undefined;
  /** The frame-tree-node id, absent for the same reason a tab id is. */
  frameId: number | undefined;
  url: string;
  /** Whether the context is a page of the extension rather than a content script. */
  isExtensionPage: boolean;
  controller: ReadableStreamDefaultController<Uint8Array>;
  isClosed: boolean;
};

export type PageStreamsOptions = {
  /** How a caller frame resolves to its hosting tab, for addressing by tab id. */
  getWebContentsFromFrame?: GetWebContentsFromFrame;
  /**
   * How long a message aimed at a tab waits for a context that has not parked
   * its stream yet, before the tab counts as having no receiving end.
   */
  waitForContextMs?: number;
};

/**
 * Small on purpose. The shim parks its stream from a `document_start` script,
 * before any of the extension's own code runs, so the only window this covers
 * is the in-process round trip between that fetch leaving the renderer and its
 * registration landing here — the page-side twin of the cold-launch wake race,
 * where a content script messaged a worker session that had not registered yet.
 * Generous would only mean a `tabs.sendMessage` to a frame that will never
 * listen hanging its callback for no reason.
 */
const DEFAULT_WAIT_FOR_CONTEXT_MS = 1000;

type ContextWaiter = {
  extensionId: string;
  tabId: number;
  frameId: number | undefined;
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * The contexts of the content-script-only sessions that have a receive stream
 * parked, and the addressing over them.
 *
 * It is the page-side mirror of the worker's job stream: a shimmed content
 * script or extension page POSTs `pageStream` as the shim installs and the
 * response body stays open, carrying everything the main process pushes at that
 * one context. The stream is per context rather than per session or per tab
 * because a context is what it dies with — no frame bookkeeping to keep honest,
 * no risk of a live frame's messages going to a dead frame's stream.
 *
 * A destroyed frame's stream is canceled by Electron, measured on 43.2.0 in
 * [PR #1017](https://github.com/zoidsh/meru/pull/1017), and that cancel is what
 * ordinarily drops a context. Liveness is still decided by the frame on top of
 * it: a context whose frame reports destroyed is dropped where it is found, and
 * a fresh stream for a frame that already has one replaces the old. Belt and
 * braces rather than the mechanism, so that nothing is ever delivered into a
 * dead frame's stream even if a cancel is late or missed.
 *
 * The envelope is generic in its `kind` on purpose: `chrome.storage`'s
 * `onChanged` fan-out is meant to ride this same stream.
 */
export class PageStreams {
  private getWebContentsFromFrame: GetWebContentsFromFrame | undefined;

  private waitForContextMs: number;

  private contexts = new Map<string, PageContext>();

  private waiters = new Set<ContextWaiter>();

  private closedListeners = new Set<(context: PageContext) => void>();

  constructor({ getWebContentsFromFrame, waitForContextMs }: PageStreamsOptions = {}) {
    this.getWebContentsFromFrame = getWebContentsFromFrame;

    this.waitForContextMs = waitForContextMs ?? DEFAULT_WAIT_FOR_CONTEXT_MS;
  }

  /**
   * Registers the stream route. The caller owns the refusal of a request from
   * the worker's own session, since only it knows which session that is.
   */
  registerRoutes(bridge: ExtensionBridge, isShimmedSession: (session: Session) => boolean) {
    bridge.handle(
      RUNTIME_PROXY_PATHS.pageStream,
      ({ session, extensionId, senderFrame, body, headers }) => {
        if (!isShimmedSession(session)) {
          return new Response(null, { status: 403, headers });
        }

        return this.handlePageStream(session, extensionId, senderFrame, body, headers);
      },
    );
  }

  /** Called for every context whose stream closed, so ports can drop it. */
  onContextClosed(listener: (context: PageContext) => void) {
    this.closedListeners.add(listener);
  }

  private handlePageStream(
    session: Session,
    extensionId: string,
    senderFrame: WebFrameMain | undefined,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    const request = body as unknown as RuntimeProxyPageStreamRequest;

    const report = parseSenderReport(request.sender);

    if (!report || !senderFrame) {
      return new Response(null, { status: 400, headers });
    }

    // The same reconstruction every relayed message goes through, for the same
    // reason: a report the caller's own frame does not back is not the context
    // it claims to be, and a stream is worth even less on a false claim than a
    // single message is. `url` is present exactly when the frame backed it.
    const sender = reconstructSender({
      session,
      extensionId,
      report,
      senderFrame,
      getWebContentsFromFrame: this.getWebContentsFromFrame,
    });

    const { url } = sender;

    if (url === undefined) {
      return new Response(null, { status: 400, headers });
    }

    // A frame that parks a second stream — a same-document navigation re-runs
    // no content script, but a fresh document in the same frame does — keeps
    // only the newer one, so nothing is ever delivered into the older
    this.dropContextsForFrame(senderFrame);

    let context: PageContext | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        context = {
          contextId: randomUUID(),
          session,
          extensionId,
          frame: senderFrame,
          tabId: sender.tab?.id,
          frameId: sender.frameId,
          url,
          isExtensionPage: url.startsWith(EXTENSION_SCHEME_PREFIX),
          controller,
          isClosed: false,
        };

        this.contexts.set(context.contextId, context);
      },
      cancel: () => {
        // The context went away with its page, where Electron cancels the body
        if (context) {
          this.closeContext(context);
        }
      },
    });

    if (context) {
      this.resolveWaiters(context);
    }

    return new Response(stream, {
      headers: { ...headers, "content-type": "application/octet-stream" },
    });
  }

  /**
   * The contexts a worker's `tabs.sendMessage` reaches: every parked context of
   * the tab, or the one frame when the call named a `frameId`. Contexts whose
   * frame is gone are dropped here rather than delivered into.
   */
  contextsForTab(extensionId: string, tabId: number, frameId?: number) {
    return this.liveContexts().filter(
      (context) =>
        context.extensionId === extensionId &&
        context.tabId === tabId &&
        (frameId === undefined || context.frameId === frameId),
    );
  }

  /**
   * The contexts a worker's `runtime.sendMessage` broadcast reaches: the
   * extension's own pages, wherever they are. Chrome delivers a runtime
   * broadcast to the extension's frames and never to content scripts, which are
   * reached with `tabs.sendMessage` — so 1Password's inline menu, notification
   * and modal frames hear it, being extension pages in a web page's frames, and
   * the content script in the same tab does not.
   */
  extensionPageContexts(extensionId: string) {
    return this.liveContexts().filter(
      (context) => context.extensionId === extensionId && context.isExtensionPage,
    );
  }

  /**
   * Every parked context of an extension, in every shimmed session — the
   * fan-out shape a `chrome.storage` change event needs, which is addressed to
   * every context rather than to a tab or to the extension's own pages.
   */
  broadcast(extensionId: string, envelope: RuntimeProxyPageEnvelope) {
    let deliveredCount = 0;

    for (const context of this.liveContexts()) {
      if (context.extensionId === extensionId && this.send(context, envelope)) {
        deliveredCount += 1;
      }
    }

    return deliveredCount;
  }

  /** Whether the envelope went onto the context's stream. */
  send(context: PageContext, envelope: RuntimeProxyPageEnvelope) {
    if (context.isClosed || !this.isContextLive(context)) {
      return false;
    }

    try {
      context.controller.enqueue(encodeNativeMessage(envelope));

      return true;
    } catch {
      // The stream stopped taking frames under us; its context is gone
      this.closeContext(context);

      return false;
    }
  }

  getContext(contextId: string) {
    const context = this.contexts.get(contextId);

    return context && this.isContextLive(context) ? context : undefined;
  }

  /**
   * The tab's contexts, waiting a bounded moment for one to park when the tab
   * has none yet. Only a tab that is really there waits: a `tabId` naming
   * nothing is settled by the caller before this is asked.
   */
  async waitForTabContexts(extensionId: string, tabId: number, frameId?: number) {
    const contexts = this.contextsForTab(extensionId, tabId, frameId);

    if (contexts.length > 0) {
      return contexts;
    }

    await new Promise<void>((resolve) => {
      const waiter: ContextWaiter = {
        extensionId,
        tabId,
        frameId,
        resolve: () => {
          this.waiters.delete(waiter);

          clearTimeout(waiter.timer);

          resolve();
        },
        timer: setTimeout(() => {
          this.waiters.delete(waiter);

          resolve();
        }, this.waitForContextMs),
      };

      this.waiters.add(waiter);
    });

    return this.contextsForTab(extensionId, tabId, frameId);
  }

  teardownSession(session: Session) {
    for (const context of this.contexts.values()) {
      if (context.session === session) {
        this.closeContext(context);
      }
    }
  }

  private resolveWaiters(context: PageContext) {
    for (const waiter of this.waiters) {
      if (
        waiter.extensionId === context.extensionId &&
        waiter.tabId === context.tabId &&
        (waiter.frameId === undefined || waiter.frameId === context.frameId)
      ) {
        waiter.resolve();
      }
    }
  }

  /**
   * Every context still worth addressing, dropping the ones whose frame has
   * gone as it goes — the belt to the cancel handler's braces.
   */
  private liveContexts() {
    const contexts: PageContext[] = [];

    for (const context of this.contexts.values()) {
      if (this.isContextLive(context)) {
        contexts.push(context);
      }
    }

    return contexts;
  }

  private isContextLive(context: PageContext) {
    if (context.isClosed) {
      return false;
    }

    if (context.frame.isDestroyed()) {
      this.closeContext(context);

      return false;
    }

    return true;
  }

  private dropContextsForFrame(frame: WebFrameMain) {
    for (const context of this.contexts.values()) {
      if (context.frame === frame) {
        this.closeContext(context);
      }
    }
  }

  private closeContext(context: PageContext) {
    if (context.isClosed) {
      return;
    }

    context.isClosed = true;

    this.contexts.delete(context.contextId);

    try {
      context.controller.close();
    } catch {
      // The stream is already gone when the context's side canceled it
    }

    for (const listener of this.closedListeners) {
      listener(context);
    }
  }
}
