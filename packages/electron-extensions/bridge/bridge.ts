import { randomUUID } from "node:crypto";
import type { OnBeforeSendHeadersListenerDetails, Session, WebFrameMain } from "electron";
import type { ExtensionsLogger } from "../logger";
import { EXTENSION_BRIDGE_SCHEME, EXTENSION_BRIDGE_TOKEN_PARAM } from "./protocol";

/**
 * Far past what any bridge call has business sending, and a bound on the copy
 * and the parse rather than on what arrives.
 *
 * Measured on Electron 43.2.0: a body reaches the handler as a single chunk,
 * string and `Blob` alike, at least up to 80 MiB — so it is already in the main
 * process by the time `readBody` sees its first value, and the cap can only
 * stop it being concatenated, decoded and parsed. Refusing in
 * `onBeforeSendHeaders` instead does not help: eight 32 MiB posts grew main's
 * RSS by 225 MiB with the listener canceling every one, against 230 MiB
 * refusing in the handler without reading and 391 MiB reading first. The
 * allocation is Chromium's, it happens before anything here is asked, and no
 * answer from this process prevents it.
 *
 * What the cap does buy is the main thread, which is the half that blocks the
 * app: nothing past it is turned into a string or handed to `JSON.parse`. And
 * only an authenticated caller reaches it, since the token is checked off the
 * query string first, so it bounds a loaded extension's own copy of the facade
 * rather than every document in the session.
 */
export const MAX_BRIDGE_REQUEST_BYTES = 64 * 1024 * 1024;

/**
 * How many bodies of one session the bridge will read at once.
 *
 * The cap above bounds one request; this bounds them together, because the
 * facade calls the bridge one round trip at a time per port and per query and
 * nothing legitimate has sixteen in the air. Past it the request is refused
 * with 429 and its body dropped, so a caller that holds streams open — an
 * extension context gone wrong, or a compromised one — cannot make the main
 * process hold an unbounded multiple of the cap.
 */
export const MAX_CONCURRENT_BRIDGE_BODY_READS = 16;

/**
 * The header the bridge stamps onto an authenticated request from a frame,
 * carrying the nonce its caller record is filed under. `protocol.handle` hands
 * the bridge only the session, but the session's `webRequest` sees the same
 * request first and Chromium tells it the frame that made it — so the bridge's
 * own `onBeforeSendHeaders` listener records that frame under a fresh nonce and
 * writes the nonce into the request the handler is about to receive (measured
 * on Electron 43.2.0: the listener runs before the handler, its callback gating
 * the request, and the stamped header arrives intact). A request the listener
 * declines to record — one carrying no token a loaded extension holds — reaches
 * the handler without the header, and is refused there for the same reason.
 * Whatever a caller puts in the header itself is dropped either way, so the
 * nonce is only ever the main process's own word.
 */
export const EXTENSION_BRIDGE_CALLER_HEADER = "x-extension-bridge-caller";

/**
 * Bounds the caller records that were stamped but never consumed — a request
 * canceled between its headers and the handler leaves its record behind.
 *
 * A record only ever goes in for a request whose token names a loaded
 * extension, which the listener reads off the URL the same way the handler
 * does, so what the cap bounds is the loaded extensions' own in-flight calls.
 * Everything else in the session — a workspace app, an XSS in a mail page —
 * holds no token and is never recorded, so no volume of its requests can evict
 * an honest caller's record that was still coming. The eviction is oldest-first
 * and ordinary traffic never approaches this.
 */
export const MAX_RECORDED_CALLER_FRAMES = 1024;

export type ExtensionBridgeHandler = (request: {
  session: Session;
  /** The extension whose facade copy carried the request's token. */
  extensionId: string;
  /**
   * The live frame Chromium recorded as the request's initiator — the page a
   * content script runs in, or an extension page of the session. Missing when
   * the request came from a service worker, which has no frame, and when the
   * frame is gone by the time the request is handled.
   */
  senderFrame: WebFrameMain | undefined;
  body: Record<string, unknown>;
  /** For the handler's `Response`, so every answer carries the CORS headers. */
  headers: Record<string, string>;
}) => Promise<Response> | Response;

type ExtensionBridgeSession = {
  /** The extension whose copy of the facade carries this token, if any. */
  getExtensionId: (bridgeToken: string) => string | undefined;
};

/**
 * A frame recorded as a caller, with the token of the document it was showing
 * at the time. Electron keeps one `WebFrameMain` per frame tree node and
 * re-points it at the new `RenderFrameHost` when the frame navigates, so the
 * instance outliving the request says nothing about the document that made it;
 * the token is what changes underneath.
 */
type RecordedCallerFrame = {
  frame: WebFrameMain;
  frameToken: string;
};

type ExtensionBridgeSessionState = ExtensionBridgeSession & {
  /** The frames recorded as callers of in-flight requests, by stamped nonce. */
  callerFramesByNonce: Map<string, RecordedCallerFrame>;
  /** Authenticated bodies being read right now, against the concurrency cap. */
  bodyReadCount: number;
};

/**
 * The main-process end of the facade's transport: one privileged custom scheme
 * per session, answered here and routed by path to whichever `chrome.*`
 * implementation registered it. The bridge owns what every route needs alike —
 * telling which extension is calling from the request's token, which frame is
 * calling from the caller stamp its own `webRequest` listener put on the
 * request, and turning anything else away — so a route handler only ever
 * receives an authenticated caller.
 */
export class ExtensionBridge {
  private logger: ExtensionsLogger | undefined;

  private sessions = new Map<Session, ExtensionBridgeSessionState>();

  private routes = new Map<string, ExtensionBridgeHandler>();

  constructor({ logger }: { logger?: ExtensionsLogger } = {}) {
    this.logger = logger;
  }

  handle(pathname: string, handler: ExtensionBridgeHandler) {
    this.routes.set(pathname, handler);
  }

  setupSession(session: Session, sessionOptions: ExtensionBridgeSession) {
    const sessionState: ExtensionBridgeSessionState = {
      ...sessionOptions,
      callerFramesByNonce: new Map(),
      bodyReadCount: 0,
    };

    this.sessions.set(session, sessionState);

    // A blocking callback is what puts the record in the map before the handler
    // reads it. That ordering is measured on Electron 43.2.0 rather than
    // promised by it, and it is allowed to be: a record that was not there
    // leaves the sender at `id` alone, which the extension refuses, so the
    // failure is a refusal rather than a wrong answer.
    //
    // The filter keeps every other request of the session — Gmail's own
    // traffic above all — out of the listener entirely. `onBeforeSendHeaders`
    // rather than `onBeforeRequest`, which is left free for an embedder's own
    // listener — a session takes exactly one per event (`blocker` in
    // `packages/app` holds that one).
    session.webRequest.onBeforeSendHeaders(
      { urls: [`${EXTENSION_BRIDGE_SCHEME}://*/*`] },
      (details, callback) => {
        callback({ requestHeaders: this.stampCaller(sessionState, details) });
      },
    );

    session.protocol.handle(EXTENSION_BRIDGE_SCHEME, (request) =>
      this.handleRequest(session, request),
    );
  }

  teardownSession(session: Session) {
    if (!this.sessions.delete(session)) {
      return;
    }

    session.webRequest.onBeforeSendHeaders(null);

    session.protocol.unhandle(EXTENSION_BRIDGE_SCHEME);
  }

  /**
   * The request's headers with the caller stamp on: the frame Chromium names
   * as the initiator goes on record under a fresh nonce, and the nonce rides
   * the request to `handleRequest`.
   *
   * A record is minted only for a token that names a loaded extension, read off
   * the URL exactly as `handleRequest` reads it, which is what keeps
   * `MAX_RECORDED_CALLER_FRAMES` a bound on the extensions' own calls rather
   * than on every document in the session. That is a condition on recording and
   * not a gate on the request: an unknown token is stripped but not stamped,
   * and goes on to the handler to be refused, since refusing here would buy no
   * memory (see
   * `MAX_BRIDGE_REQUEST_BYTES`) and would hand the page a network error where it
   * expects a 403 — and a frameless caller never reaches this listener at all,
   * so the handler's own check is the boundary either way.
   *
   * The strip loop earns its place on case: a caller writing
   * `X-Extension-Bridge-Caller` and a stamp written in lower case are two keys
   * on the same object and both reach the handler, where the header lookup is
   * case-insensitive and may read either. It runs ahead of both conditions, so
   * the caller that is stripped and then not stamped — no token, or one no
   * extension holds — does not get its own value through in place of a real
   * stamp. Removing the loop is caught by `a stamp a caller wrote itself names
   * no frame` and by `an unrecorded caller's own stamp is stripped anyway`. It
   * covers frame requests only, because this listener is the one thing a
   * frameless caller never reaches: measured
   * on Electron 43.2.0, a service worker's and a dedicated worker's requests
   * skip `onBeforeSendHeaders` entirely and arrive at the handler with whatever
   * headers they set. What makes that safe is not the stripping but the nonce:
   * it is minted here, after the request has left the renderer, so no caller
   * can name a live one, and a forged value simply misses the map and delivers
   * a sender of `id` alone. The routes that read a frame are called from the
   * shim, which only ever runs in one.
   */
  private stampCaller(
    sessionState: ExtensionBridgeSessionState,
    details: OnBeforeSendHeadersListenerDetails,
  ) {
    const requestHeaders: Record<string, string> = {};

    for (const [headerName, headerValue] of Object.entries(details.requestHeaders)) {
      if (headerName.toLowerCase() !== EXTENSION_BRIDGE_CALLER_HEADER) {
        requestHeaders[headerName] = headerValue;
      }
    }

    if (!details.frame || details.frame.isDestroyed()) {
      return requestHeaders;
    }

    const bridgeToken = new URL(details.url).searchParams.get(EXTENSION_BRIDGE_TOKEN_PARAM);

    if (bridgeToken === null || !sessionState.getExtensionId(bridgeToken)) {
      return requestHeaders;
    }

    const { callerFramesByNonce } = sessionState;

    const callerNonce = randomUUID();

    callerFramesByNonce.set(callerNonce, {
      frame: details.frame,
      frameToken: details.frame.frameToken,
    });

    if (callerFramesByNonce.size > MAX_RECORDED_CALLER_FRAMES) {
      const oldestNonce = callerFramesByNonce.keys().next().value;

      if (oldestNonce !== undefined) {
        callerFramesByNonce.delete(oldestNonce);
      }
    }

    requestHeaders[EXTENSION_BRIDGE_CALLER_HEADER] = callerNonce;

    return requestHeaders;
  }

  /**
   * The frame recorded for the request's stamped nonce, consumed on the way out
   * so a nonce answers exactly once, and only while the frame is alive and
   * still showing the document that made the request.
   *
   * The token is the second half of that. A `WebFrameMain` survives its own
   * document: Electron tracks one per frame tree node and re-points it at the
   * new `RenderFrameHost`, so a frame that navigated between the stamp and the
   * handler is alive, reads as the new document's URL and title, and would
   * otherwise be handed over as the sender of a message the old document sent.
   * A cross-document navigation swaps the `RenderFrameHost` and so the token; a
   * same-document one — `pushState`, a hash change — keeps both, which is the
   * case that must still go through.
   */
  private takeCallerFrame(sessionState: ExtensionBridgeSessionState, request: GlobalRequest) {
    const callerNonce = request.headers.get(EXTENSION_BRIDGE_CALLER_HEADER);

    if (callerNonce === null) {
      return undefined;
    }

    const recorded = sessionState.callerFramesByNonce.get(callerNonce);

    sessionState.callerFramesByNonce.delete(callerNonce);

    if (!recorded || recorded.frame.isDestroyed()) {
      return undefined;
    }

    return recorded.frame.frameToken === recorded.frameToken ? recorded.frame : undefined;
  }

  /**
   * Everything a request is refused for is settled from its URL, before the
   * body is so much as touched: the token names a loaded extension or it does
   * not, the path is registered or it is not, and the session has room for
   * another body read or it does not. The caller is any document in the session
   * — Gmail, a workspace app, whatever a user navigated to — and only the
   * loaded extensions hold a token, so what a refusal costs is what a page
   * with no token at all can spend.
   *
   * What that saves is the concatenation, the UTF-8 decode and the synchronous
   * `JSON.parse`, which is the part that blocks the thread the app draws on;
   * see `MAX_BRIDGE_REQUEST_BYTES` for what it does not save, which is the
   * arriving body itself.
   */
  private async handleRequest(session: Session, request: GlobalRequest) {
    const headers = {
      "access-control-allow-origin": request.headers.get("origin") ?? "*",
      "cache-control": "no-store",
    };

    const { pathname, searchParams } = new URL(request.url);

    try {
      const sessionState = this.sessions.get(session);

      if (!sessionState) {
        return this.refuse(request, 403, headers);
      }

      // Consumed whatever else the request turns out to be, so a nonce that
      // reached a refused request cannot be presented again
      const senderFrame = this.takeCallerFrame(sessionState, request);

      const bridgeToken = searchParams.get(EXTENSION_BRIDGE_TOKEN_PARAM);

      // Everything else in the session — Gmail, workspace apps, any page a user
      // navigated to — can reach this scheme too, and only the loaded
      // extensions hold a token. Its 122 bits sit behind an in-process fetch,
      // so the lookup's timing tells a caller nothing a guess would not cost it
      // already.
      const extensionId =
        bridgeToken === null ? undefined : sessionState.getExtensionId(bridgeToken);

      if (!extensionId) {
        return this.refuse(request, 403, headers);
      }

      const handler = this.routes.get(pathname);

      if (!handler) {
        return this.refuse(request, 404, headers);
      }

      if (sessionState.bodyReadCount >= MAX_CONCURRENT_BRIDGE_BODY_READS) {
        return this.refuse(request, 429, headers);
      }

      sessionState.bodyReadCount += 1;

      let bodySource: string | null;

      try {
        bodySource = await this.readBody(request);
      } finally {
        sessionState.bodyReadCount -= 1;
      }

      if (bodySource === null) {
        return new Response(null, { status: 413, headers });
      }

      const body = JSON.parse(bodySource) as Record<string, unknown>;

      return await handler({ session, extensionId, senderFrame, body, headers });
    } catch (error) {
      this.logger?.error("Extension bridge request failed", { pathname, error });

      return new Response(null, { status: 400, headers });
    }
  }

  /**
   * A refusal, with whatever the caller was still sending dropped rather than
   * left to arrive — the point of deciding before the body is that no part of
   * it is ever held. Canceling is not awaited, so the answer does not wait on
   * a renderer that may be mid-upload.
   */
  private refuse(request: GlobalRequest, status: number, headers: Record<string, string>) {
    // A body already ended or errored has nothing to cancel and says so by
    // throwing, which is not a reason to hold up the refusal
    void request.body?.cancel().catch(() => undefined);

    return new Response(null, { status, headers });
  }

  /**
   * The request body, or `null` the moment it runs past the cap. Only reached
   * for a caller the token has already vouched for, and the cap stops the copy
   * and the parse rather than the arrival — a body is handed over whole, so
   * canceling here frees the reference rather than avoiding the allocation.
   */
  private async readBody(request: GlobalRequest) {
    if (!request.body) {
      return "";
    }

    const reader = request.body.getReader();

    const chunks: Uint8Array[] = [];

    let byteLength = 0;

    for (;;) {
      const { value, done } = await reader.read();

      if (done) {
        return Buffer.concat(chunks).toString("utf8");
      }

      byteLength += value.byteLength;

      if (byteLength > MAX_BRIDGE_REQUEST_BYTES) {
        await reader.cancel();

        return null;
      }

      chunks.push(value);
    }
  }
}
