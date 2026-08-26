import { randomUUID } from "node:crypto";
import type { OnBeforeSendHeadersListenerDetails, Session, WebFrameMain } from "electron";
import type { ExtensionsLogger } from "../logger";
import { EXTENSION_BRIDGE_SCHEME, type ExtensionBridgeRequest } from "./protocol";

/**
 * Far past what any bridge call has business sending, but a bound all the same:
 * the scheme is reachable from every document in the session, and without one a
 * page that never learns the token could still make the main process buffer an
 * arbitrarily large body on the way to its 403.
 */
export const MAX_BRIDGE_REQUEST_BYTES = 64 * 1024 * 1024;

/**
 * The header the bridge stamps onto every request from a frame, carrying the
 * nonce its caller record is filed under. `protocol.handle` hands the bridge
 * only the session, but the session's `webRequest` sees the same request first
 * and Chromium tells it the frame that made it — so the bridge's own
 * `onBeforeSendHeaders` listener records that frame under a fresh nonce and
 * writes the nonce into the request the handler is about to receive (measured
 * on Electron 43.2.0: the listener runs before the handler, its callback gating
 * the request, and the stamped header arrives intact). Whatever a caller puts
 * in the header itself is dropped before the stamp goes on, so the nonce is
 * only ever the main process's own word.
 */
export const EXTENSION_BRIDGE_CALLER_HEADER = "x-extension-bridge-caller";

/**
 * Bounds the caller records that were stamped but never consumed — a request
 * canceled between its headers and the handler leaves its record behind. The
 * live gap between the two stages is a handful of requests, so evicting the
 * oldest past this many loses nothing that was still coming.
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

type ExtensionBridgeSessionState = ExtensionBridgeSession & {
  /** The frames recorded as callers of in-flight requests, by stamped nonce. */
  callerFramesByNonce: Map<string, WebFrameMain>;
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
    const callerFramesByNonce = new Map<string, WebFrameMain>();

    this.sessions.set(session, { ...sessionOptions, callerFramesByNonce });

    // The filter keeps every other request of the session — Gmail's own
    // traffic above all — out of the listener entirely. `onBeforeSendHeaders`
    // rather than `onBeforeRequest`, which is left free for an embedder's own
    // listener — a session takes exactly one per event (`blocker` in
    // `packages/app` holds that one).
    session.webRequest.onBeforeSendHeaders(
      { urls: [`${EXTENSION_BRIDGE_SCHEME}://*/*`] },
      (details, callback) => {
        callback({ requestHeaders: this.stampCaller(callerFramesByNonce, details) });
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
   * the request to `handleRequest`. A request without a live frame — a service
   * worker's — is passed through unstamped, and any caller-written stamp is
   * dropped either way, so a header the handler reads is always the bridge's
   * own.
   */
  private stampCaller(
    callerFramesByNonce: Map<string, WebFrameMain>,
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

    const callerNonce = randomUUID();

    callerFramesByNonce.set(callerNonce, details.frame);

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
   * The frame recorded for the request's stamped nonce, consumed on the way
   * out so a nonce answers exactly once, and only while the frame is alive.
   */
  private takeCallerFrame(sessionState: ExtensionBridgeSessionState, request: GlobalRequest) {
    const callerNonce = request.headers.get(EXTENSION_BRIDGE_CALLER_HEADER);

    if (callerNonce === null) {
      return undefined;
    }

    const callerFrame = sessionState.callerFramesByNonce.get(callerNonce);

    sessionState.callerFramesByNonce.delete(callerNonce);

    return callerFrame && !callerFrame.isDestroyed() ? callerFrame : undefined;
  }

  private async handleRequest(session: Session, request: GlobalRequest) {
    const headers = {
      "access-control-allow-origin": request.headers.get("origin") ?? "*",
      "cache-control": "no-store",
    };

    const { pathname } = new URL(request.url);

    try {
      const sessionState = this.sessions.get(session);

      // Consumed whatever else the request turns out to be, so a nonce that
      // reached a refused request cannot be presented again
      const senderFrame = sessionState && this.takeCallerFrame(sessionState, request);

      const bodySource = await this.readBody(request);

      if (bodySource === null) {
        return new Response(null, { status: 413, headers });
      }

      const body = JSON.parse(bodySource) as ExtensionBridgeRequest & Record<string, unknown>;

      // Everything else in the session — Gmail, workspace apps, any page a user
      // navigated to — can reach this scheme too, and only the loaded extensions
      // hold a token.
      const extensionId = sessionState?.getExtensionId(body.token);

      if (!extensionId) {
        return new Response(null, { status: 403, headers });
      }

      const handler = this.routes.get(pathname);

      if (!handler) {
        return new Response(null, { status: 404, headers });
      }

      return await handler({ session, extensionId, senderFrame, body, headers });
    } catch (error) {
      this.logger?.error("Extension bridge request failed", { pathname, error });

      return new Response(null, { status: 400, headers });
    }
  }

  /**
   * The request body, or `null` the moment it runs past the cap — nothing more
   * is read then, so an oversized body costs the cap and not its whole length.
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
