import { afterEach, describe, expect, test } from "bun:test";
import { encodeNativeMessage } from "../../native-messaging/framing";
import {
  WEB_NAVIGATION_PATHS,
  type WebNavigationEventDetails,
  type WebNavigationEventFrame,
  type WebNavigationListenersBody,
} from "../../web-navigation/bridge-protocol";
import { callInCallbackForm } from "../lib/callback-form";
import type { ChromeEvent } from "../lib/chrome";
import { createWebNavigation } from "./web-navigation";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type FrameQueryMethod = (details: Record<string, unknown>) => Promise<unknown>;

describe("facade webNavigation", () => {
  test("asks the bridge and answers what it said", async () => {
    const requests: { pathName: string; body: unknown }[] = [];

    globalThis.fetch = (async (url: string, init: RequestInit) => {
      requests.push({
        pathName: new URL(url).pathname,
        body: JSON.parse(init.body as string),
      });

      return Response.json({ frameId: 42, parentFrameId: 0 });
    }) as typeof fetch;

    const getFrame = createWebNavigation().getFrame as FrameQueryMethod;

    expect(await getFrame({ tabId: 12, frameId: 42 })).toEqual({ frameId: 42, parentFrameId: 0 });

    expect(requests).toEqual([
      {
        pathName: WEB_NAVIGATION_PATHS.getFrame,
        body: { details: { tabId: 12, frameId: 42 } },
      },
    ]);
  });

  test("answers null when the bridge is unreachable or refuses", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Failed to fetch");
    }) as unknown as typeof fetch;

    const webNavigation = createWebNavigation();

    expect(
      await (webNavigation.getFrame as FrameQueryMethod)({ tabId: 12, frameId: 0 }),
    ).toBeNull();

    globalThis.fetch = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch;

    expect(await (webNavigation.getAllFrames as FrameQueryMethod)({ tabId: 12 })).toBeNull();
  });

  test("answers a callback with null and no lastError when the bridge is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Failed to fetch");
    }) as unknown as typeof fetch;

    const webNavigation = createWebNavigation();

    for (const name of ["getFrame", "getAllFrames"]) {
      const { returned, answered } = callInCallbackForm(
        {},
        webNavigation[name] as (...callArguments: unknown[]) => unknown,
        { tabId: 12, frameId: 0 },
      );

      expect(returned).toBeUndefined();

      expect(await answered).toBeNull();
    }
  });
});

function settle() {
  return new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
}

function createDetails(url: string): WebNavigationEventDetails {
  return {
    tabId: 12,
    url,
    processId: 7,
    frameId: 0,
    parentFrameId: -1,
    timeStamp: 1234,
    frameType: "outermost_frame",
    documentLifecycle: "active",
  };
}

/**
 * Answers the events path with a stream the test writes frames into, and
 * records each park and whether its request was aborted since.
 */
function serveEventStream() {
  const parks: { signal: AbortSignal | undefined; body: WebNavigationListenersBody }[] = [];

  const updates: WebNavigationListenersBody[] = [];

  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const { pathname } = new URL(url);

    const body = JSON.parse(init.body as string) as WebNavigationListenersBody;

    if (pathname === WEB_NAVIGATION_PATHS.listeners) {
      updates.push(body);

      return Response.json(null);
    }

    if (pathname !== WEB_NAVIGATION_PATHS.events) {
      return new Response(null, { status: 404 });
    }

    parks.push({ signal: init.signal ?? undefined, body });

    return new Response(
      new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
        },
      }),
    );
  }) as typeof fetch;

  return {
    parks,
    updates,
    send(frame: WebNavigationEventFrame) {
      controller?.enqueue(encodeNativeMessage(frame));
    },
  };
}

describe("facade webNavigation events", () => {
  test("never fire, and never park a stream, for an extension that is not opted in", async () => {
    const { parks } = serveEventStream();

    (createWebNavigation().onCompleted as ChromeEvent).addListener(() => undefined);

    await settle();

    expect(parks).toHaveLength(0);
  });

  test("deliver what main sends to the matching event's listeners, by their url filters", async () => {
    const { parks, send } = serveEventStream();

    const webNavigation = createWebNavigation({ deliversNavigationEvents: true });

    const heard: string[] = [];

    (webNavigation.onCompleted as ChromeEvent).addListener((details) => {
      heard.push(`completed ${(details as WebNavigationEventDetails).url}`);
    });

    (webNavigation.onCompleted as ChromeEvent).addListener(
      (details) => {
        heard.push(`filtered ${(details as WebNavigationEventDetails).url}`);
      },
      { url: [{ hostEquals: "accounts.google.com" }] },
    );

    (webNavigation.onCommitted as ChromeEvent).addListener((details) => {
      heard.push(`committed ${(details as WebNavigationEventDetails).url}`);
    });

    await settle();

    expect(parks).toHaveLength(1);

    send({ type: "onCompleted", details: createDetails("https://example.com/") });
    send({ type: "onCompleted", details: createDetails("https://accounts.google.com/") });
    send({ type: "onCommitted", details: createDetails("https://example.com/next") });

    await settle();

    expect(heard).toEqual([
      "completed https://example.com/",
      "completed https://accounts.google.com/",
      "filtered https://accounts.google.com/",
      "committed https://example.com/next",
    ]);
  });

  /*
   * Bitwarden's shape: it adds an `onCompleted` listener while it waits on a
   * page and removes it from inside the listener, and main listens to every
   * page the worker reaches for as long as a stream is parked.
   */
  test("let the stream go once the last listener is removed, and park again for the next", async () => {
    const { parks, send } = serveEventStream();

    const onCompleted = createWebNavigation({ deliversNavigationEvents: true })
      .onCompleted as ChromeEvent;

    let heardCount = 0;

    const listener = () => {
      heardCount += 1;

      onCompleted.removeListener(listener);
    };

    onCompleted.addListener(listener);

    await settle();

    send({ type: "onCompleted", details: createDetails("https://example.com/") });

    await settle();

    expect(heardCount).toBe(1);

    expect(parks[0]?.signal?.aborted).toBe(true);

    onCompleted.addListener(listener);

    await settle();

    expect(parks).toHaveLength(2);

    expect(parks[1]?.signal?.aborted).toBe(false);
  });

  test("tell main which events are listened to, with the listeners' merged filters", async () => {
    const { parks, updates } = serveEventStream();

    const webNavigation = createWebNavigation({ deliversNavigationEvents: true });

    const onCompleted = webNavigation.onCompleted as ChromeEvent;

    const onCommitted = webNavigation.onCommitted as ChromeEvent;

    const filtered = () => undefined;

    onCompleted.addListener(filtered, { url: [{ hostEquals: "accounts.google.com" }] });

    await settle();

    expect(parks.map(({ body }) => body.listened)).toEqual([
      { onCompleted: [{ hostEquals: "accounts.google.com" }] },
    ]);

    onCompleted.addListener(() => undefined, { url: [{ pathPrefix: "/login" }] });

    onCommitted.addListener(() => undefined);

    onCompleted.removeListener(filtered);

    await settle();

    expect(updates.map(({ listened }) => listened)).toEqual([
      {
        onCompleted: [{ hostEquals: "accounts.google.com" }, { pathPrefix: "/login" }],
      },
      {
        onCommitted: null,
        onCompleted: [{ hostEquals: "accounts.google.com" }, { pathPrefix: "/login" }],
      },
      { onCommitted: null, onCompleted: [{ pathPrefix: "/login" }] },
    ]);

    expect(updates.every(({ streamId }) => streamId === parks[0]?.body.streamId)).toBe(true);

    expect(updates.map(({ sequence }) => sequence)).toEqual([2, 3, 4]);
  });

  test("catch main up when a listener changes while the stream is being parked", async () => {
    const { parks, updates } = serveEventStream();

    const onCompleted = createWebNavigation({ deliversNavigationEvents: true })
      .onCompleted as ChromeEvent;

    onCompleted.addListener(() => undefined, { url: [{ hostEquals: "a.example" }] });

    onCompleted.addListener(() => undefined);

    await settle();

    expect(parks).toHaveLength(1);

    expect(parks[0]?.body.listened).toEqual({ onCompleted: [{ hostEquals: "a.example" }] });

    expect(updates.map(({ listened }) => listened)).toEqual([{ onCompleted: null }]);
  });
});

/**
 * Main as the facade sees it: parks it answers only when the test releases
 * them, a listeners route that answers 404 for a stream it does not hold, and
 * a way to drop the stream it holds.
 */
/** Waits until the condition holds, or gives up after three seconds. */
async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 300 && !condition(); attempt += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

function serveMain() {
  const parks: WebNavigationListenersBody[] = [];

  const acceptedUpdates: WebNavigationListenersBody[] = [];

  const releases: (() => void)[] = [];

  let held: { listened: WebNavigationListenersBody["listened"]; sequence: number } | undefined;

  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const { pathname } = new URL(url);

    const body = JSON.parse(init.body as string) as WebNavigationListenersBody;

    if (pathname === WEB_NAVIGATION_PATHS.listeners) {
      if (!held) {
        return new Response(null, { status: 404 });
      }

      if (body.sequence > held.sequence) {
        held = { listened: body.listened, sequence: body.sequence };
      }

      acceptedUpdates.push(body);

      return Response.json(null);
    }

    parks.push(body);

    await new Promise<void>((resolve) => {
      releases.push(resolve);
    });

    held = { listened: body.listened, sequence: body.sequence };

    return new Response(
      new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
        },
      }),
    );
  }) as typeof fetch;

  return {
    parks,
    acceptedUpdates,
    readHeldListened: () => held?.listened,
    releasePark() {
      releases.shift()?.();
    },
    /** Main letting the stream go, the way the unread-frames bound or a teardown does. */
    dropStream() {
      held = undefined;

      controller?.close();
    },
    /** Main no longer holding the stream, before the facade has noticed. */
    forgetStream() {
      held = undefined;
    },
  };
}

describe("facade webNavigation listeners across a re-park", () => {
  /*
   * Bitwarden adding its `onCompleted` while its stream is being parked again,
   * after main let the first one go: main has to end up attaching for it, or
   * the save prompt never fires.
   */
  test("a listener added while the stream is parked again reaches main", async () => {
    const main = serveMain();

    const webNavigation = createWebNavigation({ deliversNavigationEvents: true });

    (webNavigation.onCommitted as ChromeEvent).addListener(() => undefined);

    await settle();

    main.releasePark();

    await settle();

    expect(main.readHeldListened()).toEqual({ onCommitted: null });

    main.dropStream();

    // The facade parks again behind its retry delay
    await waitFor(() => main.parks.length === 2);

    (webNavigation.onCompleted as ChromeEvent).addListener(() => undefined);

    await settle();

    main.releasePark();

    await waitFor(() => main.readHeldListened()?.onCompleted !== undefined);

    expect(main.readHeldListened()).toEqual({ onCommitted: null, onCompleted: null });
  });

  test("an update main answers 404 is sent again once a park connects", async () => {
    const main = serveMain();

    const webNavigation = createWebNavigation({ deliversNavigationEvents: true });

    (webNavigation.onCommitted as ChromeEvent).addListener(() => undefined);

    await settle();

    main.releasePark();

    await settle();

    main.forgetStream();

    (webNavigation.onCompleted as ChromeEvent).addListener(() => undefined);

    await settle();

    expect(main.acceptedUpdates).toHaveLength(0);

    main.dropStream();

    await waitFor(() => main.parks.length === 2);

    main.releasePark();

    await waitFor(() => main.readHeldListened()?.onCompleted !== undefined);

    expect(main.readHeldListened()).toEqual({ onCommitted: null, onCompleted: null });

    expect(main.acceptedUpdates.length).toBeGreaterThan(0);
  });
});
