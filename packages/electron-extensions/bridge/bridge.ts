import type { Session } from "electron";
import type { ExtensionsLogger } from "../logger";
import { EXTENSION_BRIDGE_SCHEME, type ExtensionBridgeRequest } from "./protocol";

/**
 * Far past what any bridge call has business sending, but a bound all the same:
 * the scheme is reachable from every document in the session, and without one a
 * page that never learns the token could still make the main process buffer an
 * arbitrarily large body on the way to its 403.
 */
export const MAX_BRIDGE_REQUEST_BYTES = 64 * 1024 * 1024;

export type ExtensionBridgeHandler = (request: {
  session: Session;
  /** The extension whose facade copy carried the request's token. */
  extensionId: string;
  body: Record<string, unknown>;
  /** For the handler's `Response`, so every answer carries the CORS headers. */
  headers: Record<string, string>;
}) => Promise<Response> | Response;

type ExtensionBridgeSession = {
  /** The extension whose copy of the facade carries this token, if any. */
  getExtensionId: (bridgeToken: string) => string | undefined;
};

/**
 * The main-process end of the facade's transport: one privileged custom scheme
 * per session, answered here and routed by path to whichever `chrome.*`
 * implementation registered it. The bridge owns what every route needs alike —
 * telling which extension is calling from the request's token, and turning
 * anything else away — so a route handler only ever receives an authenticated
 * caller.
 */
export class ExtensionBridge {
  private logger: ExtensionsLogger | undefined;

  private sessions = new Map<Session, ExtensionBridgeSession>();

  private routes = new Map<string, ExtensionBridgeHandler>();

  constructor({ logger }: { logger?: ExtensionsLogger } = {}) {
    this.logger = logger;
  }

  handle(pathname: string, handler: ExtensionBridgeHandler) {
    this.routes.set(pathname, handler);
  }

  setupSession(session: Session, sessionOptions: ExtensionBridgeSession) {
    this.sessions.set(session, sessionOptions);

    session.protocol.handle(EXTENSION_BRIDGE_SCHEME, (request) =>
      this.handleRequest(session, request),
    );
  }

  teardownSession(session: Session) {
    if (!this.sessions.delete(session)) {
      return;
    }

    session.protocol.unhandle(EXTENSION_BRIDGE_SCHEME);
  }

  private async handleRequest(session: Session, request: GlobalRequest) {
    const headers = {
      "access-control-allow-origin": request.headers.get("origin") ?? "*",
      "cache-control": "no-store",
    };

    const { pathname } = new URL(request.url);

    try {
      const bodySource = await this.readBody(request);

      if (bodySource === null) {
        return new Response(null, { status: 413, headers });
      }

      const body = JSON.parse(bodySource) as ExtensionBridgeRequest & Record<string, unknown>;

      // Everything else in the session — Gmail, workspace apps, any page a user
      // navigated to — can reach this scheme too, and only the loaded extensions
      // hold a token.
      const extensionId = this.sessions.get(session)?.getExtensionId(body.token);

      if (!extensionId) {
        return new Response(null, { status: 403, headers });
      }

      const handler = this.routes.get(pathname);

      if (!handler) {
        return new Response(null, { status: 404, headers });
      }

      return await handler({ session, extensionId, body, headers });
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
