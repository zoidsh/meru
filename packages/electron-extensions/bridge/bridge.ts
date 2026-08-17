import type { Session } from "electron";
import type { ExtensionsLogger } from "../logger";
import { EXTENSION_BRIDGE_SCHEME, type ExtensionBridgeRequest } from "./protocol";

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
 * anything else away — so a route handler only ever sees an authenticated
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
      const body = (await request.json()) as ExtensionBridgeRequest & Record<string, unknown>;

      // Everything else in the session — Gmail, workspace apps, any page a user
      // navigated to — can reach this scheme just as well, and only the loaded
      // extensions know a token
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
}
