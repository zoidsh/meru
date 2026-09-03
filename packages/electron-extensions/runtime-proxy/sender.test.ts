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

function createContents(
  contentsId: number,
  title: string,
  url: string,
  contentsSession: Session = session,
  isLoading = false,
  isCurrentlyAudible = false,
) {
  return {
    id: contentsId,
    session: contentsSession,
    isDestroyed: () => false,
    isLoading: () => isLoading,
    isCurrentlyAudible: () => isCurrentlyAudible,
    isAudioMuted: () => false,
    getURL: () => url,
    getTitle: () => title,
  } as unknown as WebContents;
}

/** The frame-to-tab mapping Electron owns in production, as a lookup table. */
function contentsOf(entries: [FakeFrame, WebContents][]) {
  const contentsByFrame = new Map(entries);

  return (frame: WebFrameMain) => contentsByFrame.get(frame as unknown as FakeFrame);
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
  test("builds the sender from the caller's frame, never from the report", () => {
    const frame = createFrame("https://accounts.google.com/signin", 12);

    const contents = createContents(7, "Sign in", "https://accounts.google.com/signin");

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://accounts.google.com/signin", isTopFrame: true },
      senderFrame: frame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[frame, contents]]),
    });

    expect(sender).toEqual({
      id: EXTENSION_ID,
      url: "https://accounts.google.com/signin",
      origin: "https://accounts.google.com",
      documentLifecycle: "active",
      frameId: 0,
      tab: {
        id: 7,
        url: "https://accounts.google.com/signin",
        title: "Sign in",
        windowId: -1,
        index: -1,
        active: true,
        highlighted: true,
        selected: true,
        pinned: false,
        incognito: false,
        status: "complete",
        groupId: -1,
        audible: false,
        mutedInfo: { muted: false },
        discarded: false,
        autoDiscardable: true,
      },
    });
  });

  test("two tabs on one URL: the tab is the caller's own, not the first match", () => {
    const pageUrl = "https://mail.google.com/mail/u/0/";

    const firstTabFrame = createFrame(pageUrl, 12);

    const callingTabFrame = createFrame(pageUrl, 34);

    const mapping = contentsOf([
      [firstTabFrame, createContents(7, "Gmail", pageUrl)],
      [callingTabFrame, createContents(8, "Gmail", pageUrl)],
    ]);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: pageUrl, isTopFrame: true },
      senderFrame: callingTabFrame as unknown as WebFrameMain,
      getWebContentsFromFrame: mapping,
    });

    expect(sender.tab?.id).toBe(8);
  });

  test("a subframe answers to its frame tree node id, and the main frame to 0", () => {
    const mainFrame = createFrame("https://accounts.google.com/", 12);

    const subFrame = createFrame("https://accounts.google.com/frame", 34, mainFrame);

    const contents = createContents(7, "Sign in", "https://accounts.google.com/");

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://accounts.google.com/frame", isTopFrame: false },
      senderFrame: subFrame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[subFrame, contents]]),
    });

    expect(sender.frameId).toBe(34);
    expect(sender.tab?.id).toBe(7);
    // The tab is the hosting page, not the subframe that spoke
    expect(sender.tab?.url).toBe("https://accounts.google.com/");
  });

  test("a top-level extension page is no tab, the way Chrome's popup is none", () => {
    const popupUrl = `chrome-extension://${EXTENSION_ID}/popup/index.html`;

    const frame = createFrame(popupUrl, 12);

    // The popup's own view backs the report; what it does not become is a tab
    const contents = createContents(7, "1Password", popupUrl);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: popupUrl, isTopFrame: true },
      senderFrame: frame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[frame, contents]]),
    });

    expect(sender).toEqual({
      id: EXTENSION_ID,
      url: popupUrl,
      origin: `chrome-extension://${EXTENSION_ID}`,
      documentLifecycle: "active",
    });
  });

  test("an extension frame inside a page keeps the tab hosting it", () => {
    const menuUrl = `chrome-extension://${EXTENSION_ID}/inline/menu/menu.html`;

    const mainFrame = createFrame("https://accounts.google.com/", 12);

    const menuFrame = createFrame(menuUrl, 34, mainFrame);

    const contents = createContents(7, "Sign in", "https://accounts.google.com/");

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: menuUrl, isTopFrame: false },
      senderFrame: menuFrame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[menuFrame, contents]]),
    });

    expect(sender.frameId).toBe(34);
    expect(sender.tab?.id).toBe(7);
    expect(sender.origin).toBe(`chrome-extension://${EXTENSION_ID}`);
  });

  test("a tab still loading says so, which is the one tab field with a source", () => {
    const pageUrl = "https://accounts.google.com/signin";

    const frame = createFrame(pageUrl, 12);

    const contents = createContents(7, "Sign in", pageUrl, session, true);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: pageUrl, isTopFrame: true },
      senderFrame: frame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[frame, contents]]),
    });

    expect(sender.tab?.status).toBe("loading");
  });

  test("a tab playing audio says so, the way Chrome's own tab does", () => {
    const pageUrl = "https://mail.google.com/mail/u/0/";

    const frame = createFrame(pageUrl, 12);

    const contents = createContents(7, "Gmail", pageUrl, session, false, true);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: pageUrl, isTopFrame: true },
      senderFrame: frame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[frame, contents]]),
    });

    expect(sender.tab?.audible).toBe(true);
  });

  test("a same-document navigation since the report still delivers the frame's own URL", () => {
    // What Gmail does constantly, and what the exact-URL check used to answer
    // with `id` alone: the shim read `location.href`, the page pushStated, and
    // the request reached the bridge against a frame at the newer URL
    const frame = createFrame("https://mail.google.com/mail/u/0/#inbox", 12);

    const contents = createContents(7, "Gmail", "https://mail.google.com/mail/u/0/#inbox");

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://mail.google.com/mail/u/0/", isTopFrame: true },
      senderFrame: frame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[frame, contents]]),
    });

    // The frame's URL, never the report's: the report buys no field of its own
    expect(sender.url).toBe("https://mail.google.com/mail/u/0/#inbox");
    expect(sender.origin).toBe("https://mail.google.com");
  });

  test("a request the bridge recorded no frame for delivers the id alone", () => {
    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://accounts.google.com/", isTopFrame: true },
      senderFrame: undefined,
      getWebContentsFromFrame: contentsOf([]),
    });

    // A report nothing backs buys nothing but the id: an extension checking
    // `sender.origin` against its own then refuses it
    expect(sender).toEqual({ id: EXTENSION_ID });
  });

  test("a report from another origin is not honored", () => {
    const frame = createFrame("https://accounts.google.com/", 12);

    const contents = createContents(7, "Sign in", "https://accounts.google.com/");

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://elsewhere.test/", isTopFrame: true },
      senderFrame: frame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[frame, contents]]),
    });

    expect(sender).toEqual({ id: EXTENSION_ID });
  });

  test("a caller cannot claim the other side of the top-frame line", () => {
    const mainFrame = createFrame("https://accounts.google.com/", 12);

    const subFrame = createFrame("https://accounts.google.com/frame", 34, mainFrame);

    const contents = createContents(7, "Sign in", "https://accounts.google.com/");

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://accounts.google.com/frame", isTopFrame: true },
      senderFrame: subFrame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[subFrame, contents]]),
    });

    expect(sender).toEqual({ id: EXTENSION_ID });
  });

  test("a frame destroyed since the request was stamped delivers the id alone", () => {
    const frame = {
      url: "https://accounts.google.com/",
      frameTreeNodeId: 12,
      parent: null,
      isDestroyed: () => true,
    };

    const contents = createContents(7, "Sign in", "https://accounts.google.com/");

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://accounts.google.com/", isTopFrame: true },
      senderFrame: frame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[frame, contents]]),
    });

    expect(sender).toEqual({ id: EXTENSION_ID });
  });

  test("a frame no live WebContents hosts delivers the id alone", () => {
    const frame = createFrame("https://accounts.google.com/", 12);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://accounts.google.com/", isTopFrame: true },
      senderFrame: frame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([]),
    });

    expect(sender).toEqual({ id: EXTENSION_ID });
  });

  test("a frame hosted outside the calling session delivers the id alone", () => {
    const frame = createFrame("https://accounts.google.com/", 12);

    const otherSession = { partition: "persist:account-2" } as unknown as Session;

    const contents = createContents(7, "Sign in", "https://accounts.google.com/", otherSession);

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "https://accounts.google.com/", isTopFrame: true },
      senderFrame: frame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[frame, contents]]),
    });

    expect(sender).toEqual({ id: EXTENSION_ID });
  });

  test("an unparseable URL a frame really has still carries a null origin", () => {
    const frame = createFrame("not a url", 12);

    const contents = createContents(7, "Odd", "not a url");

    const sender = reconstructSender({
      session,
      extensionId: EXTENSION_ID,
      report: { url: "not a url", isTopFrame: true },
      senderFrame: frame as unknown as WebFrameMain,
      getWebContentsFromFrame: contentsOf([[frame, contents]]),
    });

    expect(sender.origin).toBe("null");
    expect(sender.url).toBe("not a url");
  });
});
