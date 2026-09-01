import { describe, expect, test } from "bun:test";
import type { OnBeforeSendHeadersListenerDetails, Session, WebFrameMain } from "electron";
import {
  ExtensionBridge,
  MAX_BRIDGE_REQUEST_BYTES,
  MAX_CONCURRENT_BRIDGE_BODY_READS,
  MAX_RECORDED_CALLER_FRAMES,
} from "./bridge";
import {
  EXTENSION_BRIDGE_ORIGIN,
  EXTENSION_BRIDGE_SCHEME,
  getExtensionBridgeUrl,
} from "./protocol";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const BRIDGE_TOKEN = "bridge-token";

function createFrame(url: string): WebFrameMain {
  return { url, parent: null, isDestroyed: () => false } as unknown as WebFrameMain;
}

/** What the facade builds, plus the case it never builds: no token at all. */
function bridgeUrl(pathName: string, token: string | undefined) {
  return token === undefined
    ? `${EXTENSION_BRIDGE_ORIGIN}${pathName}`
    : getExtensionBridgeUrl(pathName, token);
}

/**
 * A request body the test decides the fate of: it produces nothing until
 * `finish` is called, so anything that reads it waits, and it says whether it
 * was canceled instead.
 */
function createPendingBody() {
  let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;

  let isCanceled = false;

  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      bodyController = controller;
    },
    cancel: () => {
      isCanceled = true;
    },
  });

  return {
    stream,
    finish: (bodySource: string) => {
      bodyController?.enqueue(new TextEncoder().encode(bodySource));

      bodyController?.close();
    },
    isCanceled: () => isCanceled,
  };
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
  /** The token on the query string; omitted, the request carries none at all. */
  token?: string;
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

    if (sendOptions.frame !== undefined) {
      beforeSendHeadersListener?.(
        {
          url,
          frame: sendOptions.frame,
          requestHeaders,
        } as OnBeforeSendHeadersListenerDetails,
        ({ requestHeaders: stampedHeaders }) => {
          if (stampedHeaders) {
            requestHeaders = stampedHeaders;
          }
        },
      );
    }

    return requestHeaders;
  };

  const sendWithHeaders = (
    pathName: string,
    body: string | ReadableStream<Uint8Array>,
    requestHeaders: Record<string, string>,
    token: string | undefined,
  ) =>
    requestHandler?.(
      new Request(bridgeUrl(pathName, token), {
        method: "POST",
        headers: requestHeaders,
        body,
        duplex: "half",
      } as RequestInit) as GlobalRequest,
    ) as Promise<Response>;

  const sendRequest = (
    pathName: string,
    body: string | ReadableStream<Uint8Array>,
    sendOptions: SendOptions = {},
  ) =>
    sendWithHeaders(
      pathName,
      body,
      stampHeaders(bridgeUrl(pathName, sendOptions.token), sendOptions),
      sendOptions.token,
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
      { value: 42 },
      { origin: "chrome-extension://aaa", token: BRIDGE_TOKEN },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ extensionId: EXTENSION_ID, echoed: 42 });
    expect(response.headers.get("access-control-allow-origin")).toBe("chrome-extension://aaa");
  });

  test("refuses a request without the token of a loaded extension", async () => {
    const { session, request } = createSession();

    const bridge = createBridge(session);

    bridge.handle("/echo", ({ headers }) => new Response(null, { status: 204, headers }));

    expect((await request("/echo", {}, { token: "guessed" })).status).toBe(403);
    expect((await request("/echo", {})).status).toBe(403);
  });

  test("answers 404 for a path nothing registered", async () => {
    const { session, request } = createSession();

    createBridge(session);

    expect((await request("/unregistered", {}, { token: BRIDGE_TOKEN })).status).toBe(404);

    // The token is checked first, so an unauthenticated caller learns nothing
    // about which paths exist
    expect((await request("/unregistered", {}, { token: "guessed" })).status).toBe(403);
  });

  test("refuses a body past the cap without handling it", async () => {
    const { session, sendRequest } = createSession();

    const bridge = createBridge(session);

    let handled = false;

    bridge.handle("/echo", ({ headers }) => {
      handled = true;

      return new Response(null, { status: 204, headers });
    });

    const response = await sendRequest(
      "/echo",
      `{"padding":"${"x".repeat(MAX_BRIDGE_REQUEST_BYTES)}"}`,
      {
        token: BRIDGE_TOKEN,
      },
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

    expect((await request("/broken", {}, { token: BRIDGE_TOKEN })).status).toBe(400);
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

    await request("/echo", {}, { frame, token: BRIDGE_TOKEN });

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

    await request("/echo", {}, { token: BRIDGE_TOKEN });

    expect(senderFrames).toEqual([undefined]);
  });

  test("a stamp a caller wrote itself names no frame", async () => {
    const { session, request } = createSession();

    const bridge = createBridge(session);

    const frame = createFrame("https://accounts.google.com/");

    const senderFrames: (WebFrameMain | undefined)[] = [];

    bridge.handle("/echo", ({ senderFrame, headers }) => {
      senderFrames.push(senderFrame);

      return new Response(null, { status: 204, headers });
    });

    /*
     * The frameless caller keeps the header it wrote, because the listener that
     * would have stripped it is the one thing it never reaches — and it gains
     * nothing, because the value names no record. The caller with a frame is
     * stripped and stamped, so it is recorded as itself rather than as whatever
     * it claimed.
     */
    await request(
      "/echo",
      {},
      { headers: { "X-Extension-Bridge-Caller": "guessed" }, token: BRIDGE_TOKEN },
    );

    await request(
      "/echo",
      {},
      { frame, headers: { "X-Extension-Bridge-Caller": "guessed" }, token: BRIDGE_TOKEN },
    );

    expect(senderFrames).toEqual([undefined, frame]);
  });

  test("a nonce is spent by the request it was minted for", async () => {
    const { session, stampHeaders, sendWithHeaders } = createSession();

    const bridge = createBridge(session);

    const victimFrame = createFrame("https://accounts.google.com/");

    const senderFrames: (WebFrameMain | undefined)[] = [];

    bridge.handle("/echo", ({ senderFrame, headers }) => {
      senderFrames.push(senderFrame);

      return new Response(null, { status: 204, headers });
    });

    /*
     * A frameless caller replaying a stamp is the shape of the only attack the
     * stripping never covers, and it is not reachable: a nonce is minted in the
     * main process after the request has left the renderer, so nothing that
     * runs in one can read a live value. Constructed here by hand for that
     * reason. What answers it is that a record is spent when it is read — the
     * victim's own request takes it, and the replay that follows finds nothing.
     */
    const victimHeaders = stampHeaders(bridgeUrl("/echo", BRIDGE_TOKEN), { frame: victimFrame });

    await sendWithHeaders("/echo", "{}", victimHeaders, BRIDGE_TOKEN);

    await sendWithHeaders("/echo", "{}", { ...victimHeaders }, BRIDGE_TOKEN);

    expect(senderFrames).toEqual([victimFrame, undefined]);
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

    const stampedHeaders = stampHeaders(bridgeUrl("/echo", BRIDGE_TOKEN), { frame });

    await sendWithHeaders("/echo", "{}", stampedHeaders, BRIDGE_TOKEN);

    // Replaying the stamped nonce finds its record already consumed
    await sendWithHeaders("/echo", "{}", stampedHeaders, BRIDGE_TOKEN);

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

    const echoUrl = bridgeUrl("/echo", BRIDGE_TOKEN);

    const oldestFrame = createFrame("https://oldest.test/");

    const oldestHeaders = stampHeaders(echoUrl, { frame: oldestFrame });

    for (let stamped = 0; stamped < MAX_RECORDED_CALLER_FRAMES; stamped += 1) {
      stampHeaders(echoUrl, { frame: createFrame("https://filler.test/") });
    }

    const newestFrame = createFrame("https://newest.test/");

    const newestHeaders = stampHeaders(echoUrl, { frame: newestFrame });

    // The oldest record was evicted to make room; the newest one is intact
    await sendWithHeaders("/echo", "{}", oldestHeaders, BRIDGE_TOKEN);

    await sendWithHeaders("/echo", "{}", newestHeaders, BRIDGE_TOKEN);

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
    const stampedHeaders = stampHeaders(bridgeUrl("/echo", BRIDGE_TOKEN), { frame });

    isFrameDestroyed = true;

    await sendWithHeaders("/echo", "{}", stampedHeaders, BRIDGE_TOKEN);

    expect(senderFrames).toEqual([undefined]);
  });

  test("refuses an unknown token with the body untouched", async () => {
    const { session, sendRequest } = createSession();

    const bridge = createBridge(session);

    bridge.handle("/echo", ({ headers }) => new Response(null, { status: 204, headers }));

    const pendingBody = createPendingBody();

    /*
     * The body never produces a chunk and never ends, so a bridge that read it
     * on the way to the refusal would not answer at all — this test would time
     * out rather than fail on a status. What it is really pinning is that the
     * cost of an unauthenticated request is the URL and nothing else, since the
     * caller is any document in the session and the body is its to size.
     */
    const response = await sendRequest("/echo", pendingBody.stream, { token: "guessed" });

    expect(response.status).toBe(403);

    // And what the caller was still sending is dropped rather than left to
    // arrive
    expect(pendingBody.isCanceled()).toBe(true);
  });

  test("refuses past the cap on bodies read at once, and frees as they finish", async () => {
    const { session, sendRequest } = createSession();

    const bridge = createBridge(session);

    bridge.handle("/echo", ({ headers }) => new Response(null, { status: 204, headers }));

    const pendingBodies = Array.from({ length: MAX_CONCURRENT_BRIDGE_BODY_READS }, () =>
      createPendingBody(),
    );

    const pendingResponses = pendingBodies.map((pendingBody) =>
      sendRequest("/echo", pendingBody.stream, { token: BRIDGE_TOKEN }),
    );

    // An authenticated caller holding the cap's worth of bodies open cannot
    // open another, and the one turned away is dropped rather than queued
    const refusedBody = createPendingBody();

    const refused = await sendRequest("/echo", refusedBody.stream, { token: BRIDGE_TOKEN });

    expect(refused.status).toBe(429);
    expect(refusedBody.isCanceled()).toBe(true);

    for (const pendingBody of pendingBodies) {
      pendingBody.finish("{}");
    }

    const statuses = (await Promise.all(pendingResponses)).map((response) => response.status);

    expect(statuses).toEqual(pendingBodies.map(() => 204));

    // The cap counts bodies in flight rather than requests ever made
    expect((await sendRequest("/echo", "{}", { token: BRIDGE_TOKEN })).status).toBe(204);
  });

  test("a refused request spends its nonce all the same", async () => {
    const { session, stampHeaders, sendWithHeaders } = createSession();

    const bridge = createBridge(session);

    const frame = createFrame("https://accounts.google.com/");

    const senderFrames: (WebFrameMain | undefined)[] = [];

    bridge.handle("/echo", ({ senderFrame, headers }) => {
      senderFrames.push(senderFrame);

      return new Response(null, { status: 204, headers });
    });

    const stampedHeaders = stampHeaders(bridgeUrl("/echo", BRIDGE_TOKEN), { frame });

    /*
     * The record is taken before the token is looked at, so that a request
     * refused for any reason cannot leave its nonce behind for another to
     * present. The refusal moved above the body read in the same change that
     * moved the token to the URL, which is exactly where this could have
     * slipped below the early return.
     */
    expect((await sendWithHeaders("/echo", "{}", stampedHeaders, "guessed")).status).toBe(403);

    await sendWithHeaders("/echo", "{}", stampedHeaders, BRIDGE_TOKEN);

    expect(senderFrames).toEqual([undefined]);
  });

  test("the cap on bodies read at once is one session's own", async () => {
    const first = createSession();

    const second = createSession();

    const bridge = new ExtensionBridge();

    bridge.handle("/echo", ({ headers }) => new Response(null, { status: 204, headers }));

    for (const { session } of [first, second]) {
      bridge.setupSession(session, {
        getExtensionId: (bridgeToken) => (bridgeToken === BRIDGE_TOKEN ? EXTENSION_ID : undefined),
      });
    }

    for (let opened = 0; opened < MAX_CONCURRENT_BRIDGE_BODY_READS; opened += 1) {
      void first.sendRequest("/echo", createPendingBody().stream, { token: BRIDGE_TOKEN });
    }

    expect((await first.sendRequest("/echo", "{}", { token: BRIDGE_TOKEN })).status).toBe(429);

    // An account whose extension misbehaves cannot spend another account's room
    expect((await second.sendRequest("/echo", "{}", { token: BRIDGE_TOKEN })).status).toBe(204);
  });
});
