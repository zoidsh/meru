import { describe, expect, test } from "bun:test";
import type { OnBeforeSendHeadersListenerDetails, Session, WebFrameMain } from "electron";
import { ExtensionBridge, MAX_BRIDGE_REQUEST_BYTES, MAX_RECORDED_CALLER_FRAMES } from "./bridge";
import { EXTENSION_BRIDGE_ORIGIN, EXTENSION_BRIDGE_SCHEME } from "./protocol";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const BRIDGE_TOKEN = "bridge-token";

function createFrame(url: string): WebFrameMain {
  return { url, parent: null, isDestroyed: () => false } as unknown as WebFrameMain;
}

type BeforeSendHeadersListener = (
  details: OnBeforeSendHeadersListenerDetails,
  callback: (response: { requestHeaders?: Record<string, string> }) => void,
) => void;

type SendOptions = {
  origin?: string;
  /** The frame Electron would name as the request's initiator, if any. */
  frame?: WebFrameMain;
  /** Headers the caller wrote itself, the way a forger would. */
  headers?: Record<string, string>;
};

function createSession() {
  const handledSchemes: string[] = [];

  let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

  let beforeSendHeadersListener: BeforeSendHeadersListener | null = null;

  const webRequestFilters: unknown[] = [];

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
    webRequest: {
      onBeforeSendHeaders: (
        filterOrListener: unknown,
        maybeListener?: BeforeSendHeadersListener | null,
      ) => {
        if (maybeListener === undefined) {
          beforeSendHeadersListener = filterOrListener as BeforeSendHeadersListener | null;

          return;
        }

        webRequestFilters.push(filterOrListener);

        beforeSendHeadersListener = maybeListener;
      },
    },
  } as unknown as Session;

  /**
   * What Electron does with a request: the headers listener runs first, its
   * callback decides the headers the request proceeds with, and only then does
   * the protocol handler see it — measured on 43.2.0, and gated by the
   * callback either way.
   */
  const stampHeaders = (url: string, sendOptions: SendOptions) => {
    let requestHeaders: Record<string, string> = { ...sendOptions.headers };

    if (sendOptions.origin !== undefined) {
      requestHeaders.origin = sendOptions.origin;
    }

    beforeSendHeadersListener?.(
      {
        url,
        frame: sendOptions.frame ?? null,
        requestHeaders,
      } as OnBeforeSendHeadersListenerDetails,
      ({ requestHeaders: stampedHeaders }) => {
        if (stampedHeaders) {
          requestHeaders = stampedHeaders;
        }
      },
    );

    return requestHeaders;
  };

  const sendWithHeaders = (
    pathName: string,
    bodySource: string,
    requestHeaders: Record<string, string>,
  ) =>
    requestHandler?.(
      new Request(`${EXTENSION_BRIDGE_ORIGIN}${pathName}`, {
        method: "POST",
        headers: requestHeaders,
        body: bodySource,
      }) as GlobalRequest,
    ) as Promise<Response>;

  const sendRequest = (pathName: string, bodySource: string, sendOptions: SendOptions = {}) =>
    sendWithHeaders(
      pathName,
      bodySource,
      stampHeaders(`${EXTENSION_BRIDGE_ORIGIN}${pathName}`, sendOptions),
    );

  return {
    session,
    handledSchemes,
    webRequestFilters,
    hasBeforeSendHeadersListener: () => beforeSendHeadersListener !== null,
    stampHeaders,
    sendWithHeaders,
    sendRequest,
    request: (pathName: string, body: Record<string, unknown>, sendOptions?: SendOptions) =>
      sendRequest(pathName, JSON.stringify(body), sendOptions),
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
      { origin: "chrome-extension://aaa" },
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

    // The token is checked first, so an unauthenticated caller learns nothing
    // about which paths exist
    expect((await request("/unregistered", { token: "guessed" })).status).toBe(403);
  });

  test("refuses a body past the cap without handling it, token or no token", async () => {
    const { session, sendRequest } = createSession();

    const bridge = createBridge(session);

    let handled = false;

    bridge.handle("/echo", ({ headers }) => {
      handled = true;

      return new Response(null, { status: 204, headers });
    });

    const response = await sendRequest(
      "/echo",
      `{"token":"${BRIDGE_TOKEN}","padding":"${"x".repeat(MAX_BRIDGE_REQUEST_BYTES)}"}`,
    );

    expect(response.status).toBe(413);
    expect(handled).toBe(false);
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
    const { session, handledSchemes, hasBeforeSendHeadersListener } = createSession();

    const bridge = createBridge(session);

    expect(handledSchemes).toEqual([EXTENSION_BRIDGE_SCHEME]);
    expect(hasBeforeSendHeadersListener()).toBe(true);

    bridge.teardownSession(session);

    expect(handledSchemes).toEqual([]);
    expect(hasBeforeSendHeadersListener()).toBe(false);

    // A session that was never set up has nothing to unhandle
    bridge.teardownSession(session);

    expect(handledSchemes).toEqual([]);
  });

  test("watches only the bridge scheme, leaving the session's other traffic alone", () => {
    const { session, webRequestFilters } = createSession();

    createBridge(session);

    expect(webRequestFilters).toEqual([{ urls: [`${EXTENSION_BRIDGE_SCHEME}://*/*`] }]);
  });

  test("hands the handler the frame Chromium recorded for the request", async () => {
    const { session, request } = createSession();

    const bridge = createBridge(session);

    const frame = createFrame("https://accounts.google.com/");

    let handledSenderFrame: WebFrameMain | undefined;

    bridge.handle("/echo", ({ senderFrame, headers }) => {
      handledSenderFrame = senderFrame;

      return new Response(null, { status: 204, headers });
    });

    await request("/echo", { token: BRIDGE_TOKEN }, { frame });

    expect(handledSenderFrame).toBe(frame);
  });

  test("a request without a frame — a service worker's — carries no sender frame", async () => {
    const { session, request } = createSession();

    const bridge = createBridge(session);

    const senderFrames: (WebFrameMain | undefined)[] = [];

    bridge.handle("/echo", ({ senderFrame, headers }) => {
      senderFrames.push(senderFrame);

      return new Response(null, { status: 204, headers });
    });

    await request("/echo", { token: BRIDGE_TOKEN });

    expect(senderFrames).toEqual([undefined]);
  });

  test("a caller writing the stamp header itself buys nothing", async () => {
    const { session, request } = createSession();

    const bridge = createBridge(session);

    const frame = createFrame("https://accounts.google.com/");

    const senderFrames: (WebFrameMain | undefined)[] = [];

    bridge.handle("/echo", ({ senderFrame, headers }) => {
      senderFrames.push(senderFrame);

      return new Response(null, { status: 204, headers });
    });

    // A frameless caller cannot conjure a frame by naming a nonce, and a
    // caller with a frame gets its own frame recorded, not the header it wrote
    await request(
      "/echo",
      { token: BRIDGE_TOKEN },
      { headers: { "X-Extension-Bridge-Caller": "guessed" } },
    );

    await request(
      "/echo",
      { token: BRIDGE_TOKEN },
      { frame, headers: { "x-extension-bridge-caller": "guessed" } },
    );

    expect(senderFrames).toEqual([undefined, frame]);
  });

  test("a stolen stamp is dropped before the bridge's own goes on", async () => {
    const { session, stampHeaders, sendWithHeaders } = createSession();

    const bridge = createBridge(session);

    const victimFrame = createFrame("https://accounts.google.com/");

    const senderFrames: (WebFrameMain | undefined)[] = [];

    bridge.handle("/echo", ({ senderFrame, headers }) => {
      senderFrames.push(senderFrame);

      return new Response(null, { status: 204, headers });
    });

    // A frameless caller presenting a live stamp lifted from another request
    // is stripped of it, so the victim's frame is never handed over
    const victimHeaders = stampHeaders(`${EXTENSION_BRIDGE_ORIGIN}/echo`, { frame: victimFrame });

    const thiefHeaders = stampHeaders(`${EXTENSION_BRIDGE_ORIGIN}/echo`, {
      headers: victimHeaders,
    });

    await sendWithHeaders("/echo", JSON.stringify({ token: BRIDGE_TOKEN }), thiefHeaders);

    expect(senderFrames).toEqual([undefined]);
  });

  test("a caller record answers exactly once", async () => {
    const { session, stampHeaders, sendWithHeaders } = createSession();

    const bridge = createBridge(session);

    const frame = createFrame("https://accounts.google.com/");

    const senderFrames: (WebFrameMain | undefined)[] = [];

    bridge.handle("/echo", ({ senderFrame, headers }) => {
      senderFrames.push(senderFrame);

      return new Response(null, { status: 204, headers });
    });

    const stampedHeaders = stampHeaders(`${EXTENSION_BRIDGE_ORIGIN}/echo`, { frame });

    const bodySource = JSON.stringify({ token: BRIDGE_TOKEN });

    await sendWithHeaders("/echo", bodySource, stampedHeaders);

    // Replaying the stamped nonce finds its record already consumed
    await sendWithHeaders("/echo", bodySource, stampedHeaders);

    expect(senderFrames).toEqual([frame, undefined]);
  });

  test("caller records left by requests that never arrive are bounded", async () => {
    const { session, stampHeaders, sendWithHeaders } = createSession();

    const bridge = createBridge(session);

    const senderFrames: (WebFrameMain | undefined)[] = [];

    bridge.handle("/echo", ({ senderFrame, headers }) => {
      senderFrames.push(senderFrame);

      return new Response(null, { status: 204, headers });
    });

    const echoUrl = `${EXTENSION_BRIDGE_ORIGIN}/echo`;

    const oldestFrame = createFrame("https://oldest.test/");

    const oldestHeaders = stampHeaders(echoUrl, { frame: oldestFrame });

    for (let stamped = 0; stamped < MAX_RECORDED_CALLER_FRAMES; stamped += 1) {
      stampHeaders(echoUrl, { frame: createFrame("https://filler.test/") });
    }

    const newestFrame = createFrame("https://newest.test/");

    const newestHeaders = stampHeaders(echoUrl, { frame: newestFrame });

    const bodySource = JSON.stringify({ token: BRIDGE_TOKEN });

    // The oldest record was evicted to make room; the newest one is intact
    await sendWithHeaders("/echo", bodySource, oldestHeaders);

    await sendWithHeaders("/echo", bodySource, newestHeaders);

    expect(senderFrames).toEqual([undefined, newestFrame]);
  });

  test("a frame destroyed since its request was stamped is not handed over", async () => {
    const { session, stampHeaders, sendWithHeaders } = createSession();

    const bridge = createBridge(session);

    let isFrameDestroyed = false;

    const frame = {
      url: "https://accounts.google.com/",
      parent: null,
      isDestroyed: () => isFrameDestroyed,
    } as unknown as WebFrameMain;

    const senderFrames: (WebFrameMain | undefined)[] = [];

    bridge.handle("/echo", ({ senderFrame, headers }) => {
      senderFrames.push(senderFrame);

      return new Response(null, { status: 204, headers });
    });

    // The frame goes away between the request's headers and its handling
    const stampedHeaders = stampHeaders(`${EXTENSION_BRIDGE_ORIGIN}/echo`, { frame });

    isFrameDestroyed = true;

    await sendWithHeaders("/echo", JSON.stringify({ token: BRIDGE_TOKEN }), stampedHeaders);

    expect(senderFrames).toEqual([undefined]);
  });
});
