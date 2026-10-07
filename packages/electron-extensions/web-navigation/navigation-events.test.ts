import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { Session, WebContents, WebFrameMain } from "electron";
import type { ExtensionBridge, ExtensionBridgeHandler } from "../bridge/bridge";
import { NativeMessageDecoder } from "../native-messaging/framing";
import {
  WEB_NAVIGATION_PATHS,
  type WebNavigationEventFrame,
  type WebNavigationListenedEvents,
} from "./bridge-protocol";
import {
  describeNavigationEvent,
  describeNetError,
  findEventFrame,
  NavigationEvents,
} from "./navigation-events";

const ACCOUNT_SESSION = { partition: "persist:account" } as unknown as Session;

const OTHER_ACCOUNT_SESSION = { partition: "persist:other" } as unknown as Session;

const WORKER_SESSION = { partition: "worker" } as unknown as Session;

const BITWARDEN_ID = "nngceckbapebfimnlniiiahkandclblb";

const ONEPASSWORD_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const EVERY_EVENT: WebNavigationListenedEvents = {
  onBeforeNavigate: null,
  onCommitted: null,
  onDOMContentLoaded: null,
  onCompleted: null,
  onErrorOccurred: null,
};

const NAVIGATION_EVENTS = [
  "did-start-navigation",
  "did-frame-navigate",
  "dom-ready",
  "did-frame-finish-load",
  "did-fail-load",
];

type FakeFrame = {
  frameTreeNodeId: number;
  processId: number;
  routingId: number;
  url: string;
  parent: FakeFrame | null;
  framesInSubtree: FakeFrame[];
  isDestroyed: () => boolean;
};

function createFrame(
  frameTreeNodeId: number,
  routingId: number,
  url: string,
  parent: FakeFrame | null,
): FakeFrame {
  return {
    frameTreeNodeId,
    processId: 7,
    routingId,
    url,
    parent,
    framesInSubtree: [],
    isDestroyed: () => false,
  };
}

/** A sign-in page with an iframe, which is a page and a frame the worker can name. */
function createPage(id: number, session: Session) {
  const mainFrame = createFrame(3, 1, "https://accounts.google.com/signin", null);

  const subframe = createFrame(42, 5, "https://accounts.google.com/frame", mainFrame);

  mainFrame.framesInSubtree = [mainFrame, subframe];

  let isDestroyed = false;

  const contents = Object.assign(new EventEmitter(), {
    id,
    session,
    mainFrame,
    isDestroyed: () => isDestroyed,
  });

  return {
    contents: contents as unknown as WebContents,
    emitter: contents,
    mainFrame,
    subframe,
    destroy() {
      isDestroyed = true;

      contents.emit("destroyed");
    },
  };
}

function settle() {
  return new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
}

function createNavigationEvents(pages: WebContents[]) {
  const createdListeners = new Set<(contents: WebContents) => void>();

  const navigationEvents = new NavigationEvents({
    deliversNavigationEvents: (extensionId) => extensionId === BITWARDEN_ID,
    canResolveTabAcrossSessions: (askingSession, tabSession) =>
      askingSession === WORKER_SESSION && tabSession === ACCOUNT_SESSION,
    getAllWebContents: () => pages,
    onWebContentsCreated: (listener) => {
      createdListeners.add(listener);

      return () => {
        createdListeners.delete(listener);
      };
    },
    now: () => 1234,
  });

  const routes = new Map<string, ExtensionBridgeHandler>();

  navigationEvents.registerRoutes({
    handle: (pathName: string, handler: ExtensionBridgeHandler) => {
      routes.set(pathName, handler);
    },
  } as ExtensionBridge);

  /** Parks a stream as a context of the extension would, and collects what reaches it. */
  const listen = async ({
    session = WORKER_SESSION,
    extensionId = BITWARDEN_ID,
    listened = EVERY_EVENT as WebNavigationListenedEvents,
    streamId = "stream",
    read = true,
  } = {}) => {
    const handler = routes.get(WEB_NAVIGATION_PATHS.events) as ExtensionBridgeHandler;

    const response = await handler({
      session,
      extensionId,
      senderFrame: undefined,
      body: { streamId, sequence: 1, listened },
      headers: {},
    });

    const frames: WebNavigationEventFrame[] = [];

    if (!response.body || !read) {
      return { response, frames, cancel: async () => undefined };
    }

    const reader = response.body.getReader();

    const decoder = new NativeMessageDecoder();

    void (async () => {
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));

        if (done) {
          return;
        }

        frames.push(...(decoder.push(value) as WebNavigationEventFrame[]));
      }
    })();

    return { response, frames, cancel: () => reader.cancel() };
  };

  /** Tells main a stream's listeners changed, as the facade does. */
  const updateListeners = async (
    streamId: string,
    sequence: number,
    listened: WebNavigationListenedEvents,
  ) => {
    const handler = routes.get(WEB_NAVIGATION_PATHS.listeners) as ExtensionBridgeHandler;

    await handler({
      session: WORKER_SESSION,
      extensionId: BITWARDEN_ID,
      senderFrame: undefined,
      body: { streamId, sequence, listened },
      headers: {},
    });
  };

  return {
    navigationEvents,
    listen,
    updateListeners,
    createdListeners,
    create(contents: WebContents) {
      for (const listener of createdListeners) {
        listener(contents);
      }
    },
  };
}

describe("describeNavigationEvent", () => {
  test("names the main frame as frame 0 with no parent, in the tab of its WebContents", () => {
    const { mainFrame } = createPage(12, ACCOUNT_SESSION);

    expect(
      describeNavigationEvent("onCompleted", 12, mainFrame as unknown as WebFrameMain, {
        timeStamp: 1234,
      }),
    ).toEqual({
      tabId: 12,
      url: "https://accounts.google.com/signin",
      processId: 7,
      frameId: 0,
      parentFrameId: -1,
      timeStamp: 1234,
      frameType: "outermost_frame",
      documentLifecycle: "active",
    });
  });

  test("names a subframe by its frame tree node id, with frame 0 as its parent", () => {
    const { subframe } = createPage(12, ACCOUNT_SESSION);

    expect(
      describeNavigationEvent("onDOMContentLoaded", 12, subframe as unknown as WebFrameMain, {
        timeStamp: 1,
      }),
    ).toMatchObject({ frameId: 42, parentFrameId: 0, frameType: "sub_frame" });
  });

  test("onBeforeNavigate carries where the frame is going and no process yet", () => {
    const { mainFrame } = createPage(12, ACCOUNT_SESSION);

    expect(
      describeNavigationEvent("onBeforeNavigate", 12, mainFrame as unknown as WebFrameMain, {
        url: "https://accounts.google.com/next",
        timeStamp: 1,
      }),
    ).toMatchObject({ url: "https://accounts.google.com/next", processId: -1, frameId: 0 });
  });

  test("onCommitted carries a transition, link for a main frame and auto_subframe below it", () => {
    const { mainFrame, subframe } = createPage(12, ACCOUNT_SESSION);

    expect(
      describeNavigationEvent("onCommitted", 12, mainFrame as unknown as WebFrameMain, {
        timeStamp: 1,
      }),
    ).toMatchObject({ transitionType: "link", transitionQualifiers: [] });

    expect(
      describeNavigationEvent("onCommitted", 12, subframe as unknown as WebFrameMain, {
        timeStamp: 1,
      }),
    ).toMatchObject({ transitionType: "auto_subframe", transitionQualifiers: [] });
  });
});

describe("describeNetError", () => {
  test("names the error by its code, whatever Electron described it as", () => {
    expect(describeNetError(-3, "")).toBe("net::ERR_ABORTED");
    expect(describeNetError(-102, "ERR_CONNECTION_REFUSED")).toBe("net::ERR_CONNECTION_REFUSED");
  });

  test("falls back to the description for a code it has no name for, and to ERR_FAILED", () => {
    expect(describeNetError(-999, "ERR_SOMETHING_NEW")).toBe("net::ERR_SOMETHING_NEW");
    expect(describeNetError(-999, "net::ERR_SOMETHING_NEW")).toBe("net::ERR_SOMETHING_NEW");
    expect(describeNetError(-999, "")).toBe("net::ERR_FAILED");
  });
});

describe("findEventFrame", () => {
  test("finds a subframe by process and routing id, and the main frame whatever its ids", () => {
    const { contents, mainFrame, subframe } = createPage(12, ACCOUNT_SESSION);

    expect(findEventFrame(contents, false, 7, 5) as unknown).toBe(subframe);
    expect(findEventFrame(contents, true, 99, 99) as unknown).toBe(mainFrame);
    expect(findEventFrame(contents, false, 7, 99)).toBeUndefined();
  });
});

describe("NavigationEvents", () => {
  test("delivers every event of a page the worker reaches, in Chrome's shape", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen } = createNavigationEvents([page.contents]);

    const { frames } = await listen();

    page.emitter.emit("did-start-navigation", {
      url: "https://accounts.google.com/next",
      isSameDocument: false,
      frame: page.mainFrame,
    });

    page.emitter.emit("did-frame-navigate", {}, page.mainFrame.url, 200, "OK", true, 7, 1);
    page.emitter.emit("dom-ready");
    page.emitter.emit("did-frame-finish-load", {}, false, 7, 5);
    page.emitter.emit("did-frame-finish-load", {}, true, 7, 1);

    await settle();

    expect(frames.map(({ type, details }) => [type, details.frameId, details.tabId])).toEqual([
      ["onBeforeNavigate", 0, 12],
      ["onCommitted", 0, 12],
      ["onDOMContentLoaded", 0, 12],
      ["onCompleted", 42, 12],
      ["onCompleted", 0, 12],
    ]);

    expect(frames[0]?.details.url).toBe("https://accounts.google.com/next");
  });

  test("skips a same-document navigation, which Chrome reports under other events", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen } = createNavigationEvents([page.contents]);

    const { frames } = await listen();

    page.emitter.emit("did-start-navigation", {
      url: "https://accounts.google.com/signin#step",
      isSameDocument: true,
      frame: page.mainFrame,
    });

    await settle();

    expect(frames).toEqual([]);
  });

  test("listens to pages only while a stream is parked", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { navigationEvents, listen, createdListeners, create } = createNavigationEvents([
      page.contents,
    ]);

    expect(NAVIGATION_EVENTS.map((name) => page.emitter.listenerCount(name))).toEqual([
      0, 0, 0, 0, 0,
    ]);

    const worker = await listen();

    const page2 = await listen();

    expect(NAVIGATION_EVENTS.map((name) => page.emitter.listenerCount(name))).toEqual([
      1, 1, 1, 1, 1,
    ]);

    const later = createPage(13, ACCOUNT_SESSION);

    create(later.contents);

    expect(navigationEvents.isWatching(later.contents)).toBe(true);

    await worker.cancel();

    await settle();

    expect(navigationEvents.isWatching(page.contents)).toBe(true);

    await page2.cancel();

    await settle();

    expect(NAVIGATION_EVENTS.map((name) => page.emitter.listenerCount(name))).toEqual([
      0, 0, 0, 0, 0,
    ]);

    expect(page.emitter.listenerCount("destroyed")).toBe(0);

    expect(navigationEvents.isWatching(later.contents)).toBe(false);

    expect(createdListeners.size).toBe(0);
  });

  test("forgets a page once it is destroyed", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { navigationEvents, listen } = createNavigationEvents([page.contents]);

    await listen();

    page.destroy();

    expect(navigationEvents.isWatching(page.contents)).toBe(false);
  });

  test("never reaches a page of a session the asking context cannot resolve", async () => {
    const reachable = createPage(12, ACCOUNT_SESSION);

    const unreachable = createPage(13, OTHER_ACCOUNT_SESSION);

    const { navigationEvents, listen } = createNavigationEvents([
      reachable.contents,
      unreachable.contents,
    ]);

    const { frames } = await listen();

    expect(navigationEvents.isWatching(unreachable.contents)).toBe(false);

    unreachable.emitter.emit("dom-ready");
    reachable.emitter.emit("dom-ready");

    await settle();

    expect(frames.map(({ details }) => details.tabId)).toEqual([12]);
  });

  test("delivers only to a stream whose session reaches the page", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen } = createNavigationEvents([page.contents]);

    const worker = await listen();

    const otherAccount = await listen({ session: OTHER_ACCOUNT_SESSION });

    page.emitter.emit("dom-ready");

    await settle();

    expect(worker.frames).toHaveLength(1);

    expect(otherAccount.frames).toHaveLength(0);
  });

  test("refuses an extension the embedder did not opt in, and attaches nothing for it", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { navigationEvents, listen } = createNavigationEvents([page.contents]);

    const { response } = await listen({ extensionId: ONEPASSWORD_ID });

    expect(response.status).toBe(403);

    expect(navigationEvents.isWatching(page.contents)).toBe(false);
  });

  /*
   * Bitwarden's shape: an unfiltered `onCommitted` for the worker's whole life,
   * and an `onCompleted` only while it waits on a page after a login.
   */
  test("listens to pages only for the events some stream listens to", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen, updateListeners } = createNavigationEvents([page.contents]);

    const { frames } = await listen({ listened: { onCommitted: null } });

    expect(NAVIGATION_EVENTS.map((name) => page.emitter.listenerCount(name))).toEqual([
      0, 1, 0, 0, 0,
    ]);

    page.emitter.emit("dom-ready");
    page.emitter.emit("did-frame-navigate", {}, page.mainFrame.url, 200, "OK", true, 7, 1);

    await updateListeners("stream", 2, { onCommitted: null, onCompleted: null });

    expect(NAVIGATION_EVENTS.map((name) => page.emitter.listenerCount(name))).toEqual([
      1, 1, 0, 1, 1,
    ]);

    page.emitter.emit("did-frame-finish-load", {}, true, 7, 1);

    await updateListeners("stream", 3, { onCommitted: null });

    expect(NAVIGATION_EVENTS.map((name) => page.emitter.listenerCount(name))).toEqual([
      0, 1, 0, 0, 0,
    ]);

    await settle();

    expect(frames.map(({ type }) => type)).toEqual(["onCommitted", "onCompleted"]);
  });

  test("ignores an update older than what the stream already holds", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen, updateListeners } = createNavigationEvents([page.contents]);

    await listen({ listened: { onCommitted: null } });

    await updateListeners("stream", 3, { onCompleted: null });

    await updateListeners("stream", 2, { onDOMContentLoaded: null });

    await updateListeners("another-stream", 9, { onBeforeNavigate: null });

    expect(NAVIGATION_EVENTS.map((name) => page.emitter.listenerCount(name))).toEqual([
      1, 0, 0, 1, 1,
    ]);
  });

  test("never sends a frame no stream's url filters match", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen } = createNavigationEvents([page.contents]);

    const filtered = await listen({
      listened: { onCompleted: [{ pathPrefix: "/frame" }] },
      streamId: "filtered",
    });

    page.emitter.emit("did-frame-finish-load", {}, true, 7, 1);
    page.emitter.emit("did-frame-finish-load", {}, false, 7, 5);

    await settle();

    expect(filtered.frames.map(({ details }) => details.url)).toEqual([
      "https://accounts.google.com/frame",
    ]);
  });

  test("drops a stream nothing reads once it has fallen far enough behind", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { navigationEvents, listen } = createNavigationEvents([page.contents]);

    const reading = await listen({ listened: { onCommitted: null }, streamId: "reading" });

    await listen({ listened: { onCommitted: null }, streamId: "dead", read: false });

    for (let index = 0; index < 100; index += 1) {
      page.emitter.emit("did-frame-navigate", {}, page.mainFrame.url, 200, "OK", true, 7, 1);

      await Promise.resolve();
    }

    await settle();

    // Still listened to, for the stream that reads
    expect(navigationEvents.isWatching(page.contents)).toBe(true);

    expect(reading.frames).toHaveLength(100);

    await reading.cancel();

    await settle();

    expect(navigationEvents.isWatching(page.contents)).toBe(false);
  });

  test("stops listening to pages once its only stream stops reading", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { navigationEvents, listen } = createNavigationEvents([page.contents]);

    await listen({ listened: { onCommitted: null }, read: false });

    for (let index = 0; index < 100; index += 1) {
      page.emitter.emit("did-frame-navigate", {}, page.mainFrame.url, 200, "OK", true, 7, 1);
    }

    expect(navigationEvents.isWatching(page.contents)).toBe(false);

    expect(NAVIGATION_EVENTS.map((name) => page.emitter.listenerCount(name))).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });

  test("stops listening to pages once no stream listens to any event", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { navigationEvents, listen, updateListeners } = createNavigationEvents([page.contents]);

    await listen({ listened: { onCompleted: null } });

    await updateListeners("stream", 2, {});

    expect(navigationEvents.isWatching(page.contents)).toBe(false);

    expect(NAVIGATION_EVENTS.map((name) => page.emitter.listenerCount(name))).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });
});

describe("NavigationEvents for a navigation that fails", () => {
  /*
   * What Electron 43 reports for a POST to a refused port, measured: the
   * start, `did-fail-load` with the URL that failed, and then `dom-ready` and
   * `did-frame-finish-load` for the error page under that same URL — and no
   * `did-frame-navigate`. Chrome fires `onBeforeNavigate` and
   * `onErrorOccurred` there, and no load event.
   */
  function failMainFrame(page: ReturnType<typeof createPage>, errorCode = -102) {
    page.emitter.emit("did-start-navigation", {
      url: "https://accounts.google.com/login",
      isSameDocument: false,
      frame: page.mainFrame,
    });

    page.emitter.emit(
      "did-fail-load",
      {},
      errorCode,
      // A stopped load reaches `did-fail-load` from `WebContents::DidFailLoad`,
      // which passes no description at all
      errorCode === -3 ? "" : "ERR_CONNECTION_REFUSED",
      "https://accounts.google.com/login",
      true,
      7,
      1,
    );

    page.emitter.emit("dom-ready");
    page.emitter.emit("did-frame-finish-load", {}, true, 7, 1);
  }

  test("fires onErrorOccurred in Chrome's shape and no load event for the error page", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen } = createNavigationEvents([page.contents]);

    const { frames } = await listen();

    failMainFrame(page);

    await settle();

    expect(frames.map(({ type }) => type)).toEqual(["onBeforeNavigate", "onErrorOccurred"]);

    expect(frames[1]?.details).toEqual({
      tabId: 12,
      url: "https://accounts.google.com/login",
      processId: -1,
      frameId: 0,
      parentFrameId: -1,
      timeStamp: 1234,
      frameType: "outermost_frame",
      documentLifecycle: "active",
      error: "net::ERR_CONNECTION_REFUSED",
    });
  });

  test("hears the frame's next navigation complete again", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen } = createNavigationEvents([page.contents]);

    const { frames } = await listen({ listened: { onCompleted: null } });

    failMainFrame(page);

    page.emitter.emit("did-start-navigation", {
      url: page.mainFrame.url,
      isSameDocument: false,
      frame: page.mainFrame,
    });

    page.emitter.emit("did-frame-finish-load", {}, true, 7, 1);

    await settle();

    expect(frames.map(({ type }) => type)).toEqual(["onCompleted"]);
  });

  /*
   * Bitwarden adds its `onCompleted` listener after the submit, which changes
   * the events main listens for and so re-attaches every page — between the
   * failure and the error page's load.
   */
  test("keeps a failure across a change of the events listened to", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen, updateListeners } = createNavigationEvents([page.contents]);

    const { frames } = await listen({ listened: { onCommitted: null, onErrorOccurred: null } });

    page.emitter.emit("did-start-navigation", {
      url: "https://accounts.google.com/login",
      isSameDocument: false,
      frame: page.mainFrame,
    });

    page.emitter.emit(
      "did-fail-load",
      {},
      -102,
      "ERR_CONNECTION_REFUSED",
      "https://accounts.google.com/login",
      true,
      7,
      1,
    );

    await updateListeners("stream", 2, {
      onCommitted: null,
      onErrorOccurred: null,
      onCompleted: null,
    });

    page.emitter.emit("did-frame-finish-load", {}, true, 7, 1);

    await settle();

    expect(frames.map(({ type }) => type)).toEqual(["onErrorOccurred"]);
  });

  test("keeps a subframe's failure to that subframe", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen } = createNavigationEvents([page.contents]);

    const { frames } = await listen({ listened: { onCompleted: null, onErrorOccurred: null } });

    page.emitter.emit(
      "did-fail-load",
      {},
      -102,
      "ERR_CONNECTION_REFUSED",
      page.subframe.url,
      false,
      7,
      5,
    );

    page.emitter.emit("did-frame-finish-load", {}, false, 7, 5);
    page.emitter.emit("did-frame-finish-load", {}, true, 7, 1);

    await settle();

    expect(frames.map(({ type, details }) => [type, details.frameId])).toEqual([
      ["onErrorOccurred", 42],
      ["onCompleted", 0],
    ]);
  });

  test("still completes a frame whose navigation was replaced rather than failed", async () => {
    const page = createPage(12, ACCOUNT_SESSION);

    const { listen } = createNavigationEvents([page.contents]);

    const { frames } = await listen({ listened: { onCompleted: null, onErrorOccurred: null } });

    failMainFrame(page, -3);

    await settle();

    expect(frames.map(({ type, details }) => [type, details.error])).toEqual([
      ["onErrorOccurred", "net::ERR_ABORTED"],
      ["onCompleted", undefined],
    ]);
  });
});
