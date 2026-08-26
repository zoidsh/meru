import { describe, expect, test } from "bun:test";
import type { Session, WebContents, WebFrameMain } from "electron";
import { parseSenderReport, reconstructSender } from "./sender";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const session = { partition: "persist:account-1" } as unknown as Session;

type FakeFrame = {
  url: string;
  frameTreeNodeId: number;
  parent: FakeFrame | null;
  isDestroyed: () => boolean;
};

function createFrame(
  url: string,
  frameTreeNodeId: number,
  parent: FakeFrame | null = null,
): FakeFrame {
  return { url, frameTreeNodeId, parent, isDestroyed: () => false };
}

function createContents(contentsId: number, title: string, frames: FakeFrame[]) {
  return {
    id: contentsId,
    session,
    isDestroyed: () => false,
    getURL: () => frames[0]?.url ?? "",
    getTitle: () => title,
    mainFrame: { framesInSubtree: frames } as unknown as WebFrameMain,
  } as unknown as WebContents;
}

describe("parseSenderReport", () => {
  test("takes only the shape the shim sends", () => {
    expect(parseSenderReport({ url: "https://accounts.google.com/", isTopFrame: true })).toEqual({
      url: "https://accounts.google.com/",
      isTopFrame: true,
    });

    expect(parseSenderReport(undefined)).toBeUndefined();
    expect(parseSenderReport("https://accounts.google.com/")).toBeUndefined();
    expect(parseSenderReport({ url: "https://accounts.google.com/" })).toBeUndefined();
    expect(parseSenderReport({ url: 42, isTopFrame: true })).toBeUndefined();
  });
});

describe("reconstructSender", () => {
  test("builds the sender from the frame backing the report, never from the report", () => {
    const contents = createContents(7, "Sign in", [
      createFrame("https://accounts.google.com/signin", 12),
    ]);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://accounts.google.com/signin", isTopFrame: true },
      getTabWebContents: () => [contents],
    });

    expect(sender).toEqual({
      id: EXTENSION_ID,
      url: "https://accounts.google.com/signin",
      origin: "https://accounts.google.com",
      frameId: 0,
      tab: {
        id: 7,
        url: "https://accounts.google.com/signin",
        title: "Sign in",
        windowId: -1,
        index: -1,
        active: true,
        highlighted: true,
        pinned: false,
        incognito: false,
      },
    });
  });

  test("a subframe answers to its frame tree node id, and the main frame to 0", () => {
    const mainFrame = createFrame("https://accounts.google.com/", 12);

    const subFrame = createFrame("https://accounts.google.com/frame", 34, mainFrame);

    const contents = createContents(7, "Sign in", [mainFrame, subFrame]);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://accounts.google.com/frame", isTopFrame: false },
      getTabWebContents: () => [contents],
    });

    expect(sender.frameId).toBe(34);
    expect(sender.tab?.id).toBe(7);
  });

  test("tab ids are WebContents ids, so two sessions' tabs never collide", () => {
    // Electron numbers WebContents across the app; the fake ids just mirror that
    const firstSessionContents = createContents(3, "First", [createFrame("https://a.test/", 1)]);

    const secondSessionContents = createContents(4, "Second", [createFrame("https://a.test/", 1)]);

    const firstSender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://a.test/", isTopFrame: true },
      getTabWebContents: () => [firstSessionContents],
    });

    const secondSender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://a.test/", isTopFrame: true },
      getTabWebContents: () => [secondSessionContents],
    });

    expect(firstSender.tab?.id).toBe(3);
    expect(secondSender.tab?.id).toBe(4);
    expect(firstSender.tab?.id).not.toBe(secondSender.tab?.id);
  });

  test("a top-level extension page is no tab, the way Chrome's popup is none", () => {
    const popupUrl = `chrome-extension://${EXTENSION_ID}/popup/index.html`;

    // The popup's own view backs the report; what it does not become is a tab
    const contents = createContents(7, "1Password", [createFrame(popupUrl, 12)]);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: popupUrl, isTopFrame: true },
      getTabWebContents: () => [contents],
    });

    expect(sender).toEqual({
      id: EXTENSION_ID,
      url: popupUrl,
      origin: `chrome-extension://${EXTENSION_ID}`,
    });
  });

  test("an extension frame inside a page keeps the tab hosting it", () => {
    const menuUrl = `chrome-extension://${EXTENSION_ID}/inline/menu/menu.html`;

    const mainFrame = createFrame("https://accounts.google.com/", 12);

    const menuFrame = createFrame(menuUrl, 34, mainFrame);

    const contents = createContents(7, "Sign in", [mainFrame, menuFrame]);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: menuUrl, isTopFrame: false },
      getTabWebContents: () => [contents],
    });

    expect(sender.frameId).toBe(34);
    expect(sender.tab?.id).toBe(7);
    expect(sender.origin).toBe(`chrome-extension://${EXTENSION_ID}`);
  });

  test("a report no live frame backs is not honored, url and origin included", () => {
    const contents = createContents(7, "Sign in", [
      createFrame("https://accounts.google.com/", 12),
    ]);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://gone.test/", isTopFrame: true },
      getTabWebContents: () => [contents],
    });

    // Reporting a URL the session does not have buys nothing but the id: an
    // extension checking `sender.origin` against its own then refuses it
    expect(sender).toEqual({ id: EXTENSION_ID });
  });

  test("an extension page no live frame backs is not honored either", () => {
    const contents = createContents(7, "Sign in", [
      createFrame("https://accounts.google.com/", 12),
    ]);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: `chrome-extension://${EXTENSION_ID}/popup/index.html`, isTopFrame: true },
      getTabWebContents: () => [contents],
    });

    expect(sender).toEqual({ id: EXTENSION_ID });
  });

  test("a content script cannot borrow a frame by claiming the wrong side of the top-frame line", () => {
    const mainFrame = createFrame("https://accounts.google.com/", 12);

    const subFrame = createFrame("https://accounts.google.com/frame", 34, mainFrame);

    const contents = createContents(7, "Sign in", [mainFrame, subFrame]);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://accounts.google.com/frame", isTopFrame: true },
      getTabWebContents: () => [contents],
    });

    expect(sender).toEqual({ id: EXTENSION_ID });
  });

  test("an unparseable URL backs nothing, so it yields the id alone", () => {
    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "not a url", isTopFrame: true },
      getTabWebContents: () => [],
    });

    expect(sender).toEqual({ id: EXTENSION_ID });
  });
});
