import { describe, expect, test } from "bun:test";
import type { Session } from "electron";
import { ExtensionBridge } from "./bridge";
import { EXTENSION_BRIDGE_ORIGIN, EXTENSION_BRIDGE_SCHEME } from "./protocol";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const BRIDGE_TOKEN = "bridge-token";

function createSession() {
  const handledSchemes: string[] = [];

  let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

  const session = {
    protocol: {
      handle: (scheme: string, handler: (request: GlobalRequest) => Promise<Response>) => {
        handledSchemes.push(scheme);

        requestHandler = handler;
      },
      unhandle: (scheme: string) => {
        handledSchemes.splice(handledSchemes.indexOf(scheme), 1);

        requestHandler = undefined;
      },
    },
  } as unknown as Session;

  return {
    session,
    handledSchemes,
    request: (pathName: string, body: Record<string, unknown>, origin?: string) =>
      requestHandler?.({
        url: `${EXTENSION_BRIDGE_ORIGIN}${pathName}`,
        headers: new Headers(origin === undefined ? {} : { origin }),
        json: async () => body,
      } as unknown as GlobalRequest) as Promise<Response>,
  };
}

function createBridge(session: Session) {
  const bridge = new ExtensionBridge();

  bridge.setupSession(session, {
    getExtensionId: (bridgeToken) => (bridgeToken === BRIDGE_TOKEN ? EXTENSION_ID : undefined),
  });

  return bridge;
}

describe("ExtensionBridge", () => {
  test("routes an authenticated request to its handler", async () => {
    const { session, request } = createSession();

    const bridge = createBridge(session);

    bridge.handle("/echo", ({ extensionId, body, headers }) =>
      Response.json({ extensionId, echoed: body.value }, { headers }),
    );

    const response = await request(
      "/echo",
      { token: BRIDGE_TOKEN, value: 42 },
      "chrome-extension://aaa",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ extensionId: EXTENSION_ID, echoed: 42 });
    expect(response.headers.get("access-control-allow-origin")).toBe("chrome-extension://aaa");
  });

  test("refuses a request without the token of a loaded extension", async () => {
    const { session, request } = createSession();

    const bridge = createBridge(session);

    bridge.handle("/echo", ({ headers }) => new Response(null, { status: 204, headers }));

    expect((await request("/echo", { token: "guessed" })).status).toBe(403);
    expect((await request("/echo", {})).status).toBe(403);
  });

  test("answers 404 for a path nothing registered", async () => {
    const { session, request } = createSession();

    createBridge(session);

    expect((await request("/unregistered", { token: BRIDGE_TOKEN })).status).toBe(404);
  });

  test("answers 400 when the handler throws", async () => {
    const { session, request } = createSession();

    const bridge = createBridge(session);

    bridge.handle("/broken", () => {
      throw new Error("boom");
    });

    expect((await request("/broken", { token: BRIDGE_TOKEN })).status).toBe(400);
  });

  test("handles the scheme for the session's lifetime", () => {
    const { session, handledSchemes } = createSession();

    const bridge = createBridge(session);

    expect(handledSchemes).toEqual([EXTENSION_BRIDGE_SCHEME]);

    bridge.teardownSession(session);

    expect(handledSchemes).toEqual([]);

    // A session that was never set up has nothing to unhandle
    bridge.teardownSession(session);

    expect(handledSchemes).toEqual([]);
  });
});
