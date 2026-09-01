import { describe, expect, test } from "bun:test";
import type { Session, WebContents } from "electron";
import { ExtensionBridge } from "../bridge/bridge";
import { getExtensionBridgeUrl } from "../bridge/protocol";
import { WEB_NAVIGATION_PATHS } from "./bridge-protocol";
import { WebNavigation } from "./web-navigation";

const SESSION = { partition: "persist:one" } as unknown as Session;

const OTHER_SESSION = { partition: "persist:two" } as unknown as Session;

const TAB_ID = 12;

type FakeFrame = {
  frameTreeNodeId: number;
  url: string;
  parent: FakeFrame | null;
  processId: number;
  isDestroyed: () => boolean;
  framesInSubtree: FakeFrame[];
};

function createFrame(
  frameTreeNodeId: number,
  url: string,
  parent: FakeFrame | null,
  { isDestroyed = false } = {},
): FakeFrame {
  return {
    frameTreeNodeId,
    url,
    parent,
    processId: 7,
    isDestroyed: () => isDestroyed,
    framesInSubtree: [],
  };
}

/**
 * The shape of 1Password's fill flow: a page's main frame, the inline-menu
 * iframe the content script injected into it, and a frame nested one deeper.
 */
function createTab({ session = SESSION, isDestroyed = false } = {}) {
  const mainFrame = createFrame(1, "https://accounts.google.com/signin", null);

  const menuFrame = createFrame(42, "chrome-extension://aaa/menu.html", mainFrame);

  const nestedFrame = createFrame(77, "https://accounts.google.com/challenge", menuFrame);

  mainFrame.framesInSubtree = [mainFrame, menuFrame, nestedFrame];

  const contents = {
    id: TAB_ID,
    session,
    isDestroyed: () => isDestroyed,
    mainFrame,
  } as unknown as WebContents;

  return { contents, mainFrame, menuFrame, nestedFrame };
}

function createWebNavigation(contents: WebContents) {
  return new WebNavigation({
    getWebContentsById: (tabId) => (tabId === TAB_ID ? contents : undefined),
  });
}

describe("WebNavigation", () => {
  test("answers the main frame as frame 0", () => {
    const { contents } = createTab();

    expect(createWebNavigation(contents).getFrame(SESSION, { tabId: TAB_ID, frameId: 0 })).toEqual({
      frameId: 0,
      parentFrameId: -1,
      processId: 7,
      url: "https://accounts.google.com/signin",
      errorOccurred: false,
      frameType: "outermost_frame",
      documentLifecycle: "active",
    });
  });

  test("answers a subframe by its frame tree node id, with its parent's id", () => {
    const { contents } = createTab();

    const webNavigation = createWebNavigation(contents);

    expect(webNavigation.getFrame(SESSION, { tabId: TAB_ID, frameId: 42 })).toMatchObject({
      frameId: 42,
      parentFrameId: 0,
      url: "chrome-extension://aaa/menu.html",
      frameType: "sub_frame",
    });

    expect(webNavigation.getFrame(SESSION, { tabId: TAB_ID, frameId: 77 })).toMatchObject({
      frameId: 77,
      parentFrameId: 42,
    });
  });

  test("never answers the main frame to its own node id, the way Chrome doesn't", () => {
    const { contents, mainFrame } = createTab();

    expect(
      createWebNavigation(contents).getFrame(SESSION, {
        tabId: TAB_ID,
        frameId: mainFrame.frameTreeNodeId,
      }),
    ).toBeNull();
  });

  test("answers null for what it cannot find", () => {
    const { contents } = createTab();

    const webNavigation = createWebNavigation(contents);

    expect(webNavigation.getFrame(SESSION, { tabId: TAB_ID, frameId: 999 })).toBeNull();
    expect(webNavigation.getFrame(SESSION, { tabId: 999, frameId: 0 })).toBeNull();
    expect(webNavigation.getFrame(SESSION, { tabId: TAB_ID, frameId: "0" })).toBeNull();
    expect(webNavigation.getFrame(SESSION, undefined)).toBeNull();
    expect(webNavigation.getAllFrames(SESSION, { tabId: 999 })).toBeNull();
  });

  test("answers only the session the tab belongs to", () => {
    const { contents } = createTab();

    const webNavigation = createWebNavigation(contents);

    expect(webNavigation.getFrame(OTHER_SESSION, { tabId: TAB_ID, frameId: 0 })).toBeNull();
    expect(webNavigation.getAllFrames(OTHER_SESSION, { tabId: TAB_ID })).toBeNull();
  });

  test("answers nothing for a destroyed tab", () => {
    const { contents } = createTab({ isDestroyed: true });

    expect(
      createWebNavigation(contents).getFrame(SESSION, { tabId: TAB_ID, frameId: 0 }),
    ).toBeNull();
  });

  test("answers a live frame while another frame in the tree is disposed", () => {
    const { contents, mainFrame } = createTab();

    // A disposed WebFrameMain throws from every accessor but isDestroyed
    const disposedFrame: FakeFrame = {
      isDestroyed: () => true,
      get frameTreeNodeId(): number {
        throw new Error("Render frame was disposed before WebFrameMain could be accessed");
      },
      get url(): string {
        throw new Error("Render frame was disposed before WebFrameMain could be accessed");
      },
      get parent(): FakeFrame | null {
        throw new Error("Render frame was disposed before WebFrameMain could be accessed");
      },
      get processId(): number {
        throw new Error("Render frame was disposed before WebFrameMain could be accessed");
      },
      framesInSubtree: [],
    };

    mainFrame.framesInSubtree.splice(1, 0, disposedFrame);

    const webNavigation = createWebNavigation(contents);

    expect(webNavigation.getFrame(SESSION, { tabId: TAB_ID, frameId: 42 })).toMatchObject({
      frameId: 42,
    });

    expect(
      webNavigation.getAllFrames(SESSION, { tabId: TAB_ID })?.map(({ frameId }) => frameId),
    ).toEqual([0, 42, 77]);
  });

  test("lists every live frame of a tab", () => {
    const { contents, nestedFrame } = createTab();

    nestedFrame.isDestroyed = () => true;

    const frames = createWebNavigation(contents).getAllFrames(SESSION, { tabId: TAB_ID });

    expect(frames?.map(({ frameId }) => frameId)).toEqual([0, 42]);
  });

  test("answers frame queries over the bridge", async () => {
    let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

    const bridgeSession = {
      protocol: {
        handle: (_scheme: string, handler: (request: GlobalRequest) => Promise<Response>) => {
          requestHandler = handler;
        },
        unhandle: () => undefined,
      },
      webRequest: {
        onBeforeSendHeaders: () => undefined,
      },
    } as unknown as Session;

    const { contents } = createTab({ session: bridgeSession });

    const bridge = new ExtensionBridge();

    createWebNavigation(contents).registerRoutes(bridge);

    bridge.setupSession(bridgeSession, {
      getExtensionId: (bridgeToken) => (bridgeToken === "token" ? "aaa" : undefined),
    });

    const response = await requestHandler?.(
      new Request(getExtensionBridgeUrl(WEB_NAVIGATION_PATHS.getFrame, "token"), {
        method: "POST",
        body: JSON.stringify({ details: { tabId: TAB_ID, frameId: 42 } }),
      }) as GlobalRequest,
    );

    expect(await response?.json()).toMatchObject({ frameId: 42, parentFrameId: 0 });
  });
});
