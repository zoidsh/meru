import { describe, expect, test } from "bun:test";
import type { Session, WebFrameMain } from "electron";
import type { ExtensionBridge, ExtensionBridgeHandler } from "../bridge/bridge";
import { NativeMessageDecoder } from "../native-messaging/framing";
import {
  MAIN_WINDOW_ID,
  WINDOWS_PATHS,
  type WindowsEventFrame,
  type WindowsWindowResponse,
} from "./bridge-protocol";
import { type ExtensionWindow, type ExtensionWindowOpenDetails, Windows } from "./windows";

const BITWARDEN_ID = "nngceckbapebfimnlniiiahkandclblb";

const ONEPASSWORD_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const UNLOCK_PATH = "popup/index.html?uilocation=popout&singleActionPopout=auth_unlockExtension";

type FakeWindow = ExtensionWindow & {
  details: ExtensionWindowOpenDetails;
  frame: WebFrameMain;
  isClosed: boolean;
  focusCount: number;
  destroy: () => void;
};

/**
 * The embedder's half, with the one frame the window holds standing in for its
 * page — which is what a `getCurrent` from inside the window resolves through.
 */
function createFakeEmbedder({ opensWindows = [BITWARDEN_ID] }: { opensWindows?: string[] } = {}) {
  const openedWindows: FakeWindow[] = [];

  const windows = new Windows({
    canOpenWindows: (extensionId) => opensWindows.includes(extensionId),
    openWindow: (details) => {
      const closedListeners: (() => void)[] = [];

      const window: FakeWindow = {
        details,
        frame: {} as WebFrameMain,
        isClosed: false,
        focusCount: 0,
        focus: () => {
          window.focusCount += 1;
        },
        close: () => {
          window.isClosed = true;

          for (const listener of closedListeners) {
            listener();
          }
        },
        isDestroyed: () => window.isClosed,
        isFocused: () => true,
        getBounds: () => ({ x: 60, y: 40, width: 380, height: 630 }),
        containsFrame: (frame) => frame === window.frame,
        onClosed: (listener) => {
          closedListeners.push(listener);
        },
        // A window the embedder lost without saying so, which is every window
        // whose app quit the renderer out from under it
        destroy: () => {
          window.isClosed = true;
        },
      };

      openedWindows.push(window);

      return window;
    },
  });

  return { windows, openedWindows };
}

describe("Windows", () => {
  test("opens a window for the extension's own page, resolved against its origin", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    const { window } = windows.create(BITWARDEN_ID, {
      url: UNLOCK_PATH,
      type: "popup",
      focused: true,
      width: 380,
      height: 630,
      left: 60,
      top: 40,
    });

    expect(openedWindows[0]?.details).toEqual({
      extensionId: BITWARDEN_ID,
      url: `chrome-extension://${BITWARDEN_ID}/${UNLOCK_PATH}`,
      width: 380,
      height: 630,
      left: 60,
      top: 40,
      type: "popup",
    });

    expect(window).toEqual({
      id: 2,
      focused: true,
      incognito: false,
      alwaysOnTop: false,
      state: "normal",
      type: "popup",
      top: 40,
      left: 60,
      width: 380,
      height: 630,
      tabs: [],
    });
  });

  /*
   * 1 is the fake window the facade answers with, and an embedder's own window
   * ids start there too, so nothing an extension is told can name one of them.
   */
  test("hands out ids of its own, past the facade's fake window", () => {
    const { windows } = createFakeEmbedder();

    expect(windows.create(BITWARDEN_ID, { url: "popup/index.html" }).window?.id).toBe(2);

    expect(windows.create(BITWARDEN_ID, { url: "popup/other.html" }).window?.id).toBe(3);
  });

  test("opens nothing for an extension the embedder did not opt in", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    expect(windows.create(ONEPASSWORD_ID, { url: "popup/index.html#detached" })).toEqual({
      window: null,
    });

    expect(openedWindows).toEqual([]);
  });

  test("opens nothing when the embedder makes no windows at all", () => {
    expect(new Windows().create(BITWARDEN_ID, { url: "popup/index.html" })).toEqual({
      window: null,
    });
  });

  /*
   * A window outside the extension would be a browser window with none of the
   * embedder's own handling on it, which is a separate decision — so it is
   * refused with a reason the extension hears rather than opened.
   */
  test("refuses a URL that is not a page of the calling extension", () => {
    const { windows, openedWindows } = createFakeEmbedder({
      opensWindows: [BITWARDEN_ID, ONEPASSWORD_ID],
    });

    for (const url of [
      "https://vault.bitwarden.com/",
      `chrome-extension://${ONEPASSWORD_ID}/popup/index.html`,
      // The origin of this one is the host after the `@`, which a prefix test
      // on the string would read as the extension's own
      `chrome-extension://${BITWARDEN_ID}@evil.example/popup.html`,
      "javascript:alert(1)",
      undefined,
      42,
    ]) {
      const { window, error } = windows.create(BITWARDEN_ID, { url });

      expect(window).toBeNull();

      expect(error).toBeString();
    }

    expect(openedWindows).toEqual([]);
  });

  test("takes the first URL of an array, as Chrome does", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    windows.create(BITWARDEN_ID, { url: ["popup/index.html", "popup/other.html"] });

    expect(openedWindows[0]?.details.url).toBe(
      `chrome-extension://${BITWARDEN_ID}/popup/index.html`,
    );
  });

  test("passes on no bounds for values that are not finite numbers", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    windows.create(BITWARDEN_ID, {
      url: "popup/index.html",
      width: "380",
      height: Number.NaN,
      left: Number.POSITIVE_INFINITY,
    });

    expect(openedWindows[0]?.details).toMatchObject({
      width: undefined,
      height: undefined,
      left: undefined,
      top: undefined,
      type: "normal",
    });
  });

  /*
   * An extension that opens its unlock popout from two places at once means one
   * unlock rather than two windows of it.
   */
  test("focuses and answers the window already open for that URL", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    const first = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH, type: "popup" });

    const second = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH, type: "popup" });

    expect(second.window?.id).toBe(first.window?.id);

    expect(openedWindows).toHaveLength(1);

    expect(openedWindows[0]?.focusCount).toBe(1);
  });

  test("opens another window once the one for that URL has closed", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    const first = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    openedWindows[0]?.close();

    const second = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    expect(second.window?.id).not.toBe(first.window?.id);

    expect(openedWindows).toHaveLength(2);
  });

  test("opens another window for a window the embedder destroyed silently", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    openedWindows[0]?.destroy();

    expect(windows.create(BITWARDEN_ID, { url: UNLOCK_PATH }).window?.id).toBe(3);

    expect(openedWindows).toHaveLength(2);
  });

  test("closes the window a remove names", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    const { window } = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    windows.remove(BITWARDEN_ID, window?.id);

    expect(openedWindows[0]?.isClosed).toBe(true);
  });

  test("leaves another extension's window, and an id it holds none of, alone", () => {
    const { windows, openedWindows } = createFakeEmbedder({
      opensWindows: [BITWARDEN_ID, ONEPASSWORD_ID],
    });

    const { window } = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    windows.remove(ONEPASSWORD_ID, window?.id);

    windows.remove(BITWARDEN_ID, 1);

    windows.remove(BITWARDEN_ID, "2");

    expect(openedWindows[0]?.isClosed).toBe(false);
  });

  test("answers get for a window of the calling extension and nothing else", () => {
    const { windows } = createFakeEmbedder({ opensWindows: [BITWARDEN_ID, ONEPASSWORD_ID] });

    const { window } = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH, type: "popup" });

    expect(windows.get(BITWARDEN_ID, window?.id, undefined).window).toEqual(window);

    expect(windows.get(ONEPASSWORD_ID, window?.id, undefined).window).toBeNull();

    expect(windows.get(BITWARDEN_ID, 99, undefined).window).toBeNull();
  });

  /* How a popout closes itself: `getCurrent`, then `remove` of what it answered. */
  test("answers get with no id with the window the calling frame is the page of", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    const { window } = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    const popoutFrame = openedWindows[0]?.frame as WebFrameMain;

    expect(windows.get(BITWARDEN_ID, undefined, popoutFrame).window?.id).toBe(window?.id);

    expect(windows.get(BITWARDEN_ID, undefined, {} as WebFrameMain).window).toBeNull();

    // Every call from a service worker, which has no frame
    expect(windows.get(BITWARDEN_ID, undefined, undefined).window).toBeNull();
  });

  test("resolves WINDOW_ID_CURRENT to the window the calling frame is the page of", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    const { window } = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    const popoutFrame = openedWindows[0]?.frame as WebFrameMain;

    expect(windows.get(BITWARDEN_ID, -2, popoutFrame).window?.id).toBe(window?.id);

    windows.remove(BITWARDEN_ID, -2, undefined);

    expect(windows.get(BITWARDEN_ID, window?.id, undefined).window).not.toBeNull();

    windows.remove(BITWARDEN_ID, -2, popoutFrame);

    expect(windows.get(BITWARDEN_ID, window?.id, undefined).window).toBeNull();
  });

  /*
   * What unloading takes with it: an uninstall deletes the copy the page was
   * loaded from, so a window left open would be a window of nothing.
   */
  test("closes one extension's windows and leaves another's", () => {
    const { windows, openedWindows } = createFakeEmbedder({
      opensWindows: [BITWARDEN_ID, ONEPASSWORD_ID],
    });

    windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    windows.create(BITWARDEN_ID, { url: "popup/index.html" });

    const otherWindow = windows.create(ONEPASSWORD_ID, { url: "popup/index.html" });

    windows.closeExtensionWindows(BITWARDEN_ID);

    expect(openedWindows.map((window) => window.isClosed)).toEqual([true, true, false]);

    expect(windows.get(ONEPASSWORD_ID, otherWindow.window?.id, undefined).window).not.toBeNull();
  });
});

describe("Windows.watch", () => {
  function watchEvents(windows: Windows) {
    const events: string[] = [];

    windows.watch({
      opened: (extensionId, windowId) => {
        events.push(`opened ${extensionId} ${windowId}`);
      },
      closedByUser: (extensionId, windowId) => {
        events.push(`closedByUser ${extensionId} ${windowId}`);
      },
    });

    return events;
  }

  test("reports a window opening, and the user closing it", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    const events = watchEvents(windows);

    const windowId = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH }).window?.id;

    openedWindows[0]?.close();

    expect(events).toEqual([
      `opened ${BITWARDEN_ID} ${windowId}`,
      `closedByUser ${BITWARDEN_ID} ${windowId}`,
    ]);
  });

  test("reports no user close for a window the extension removed", () => {
    const { windows } = createFakeEmbedder();

    const events = watchEvents(windows);

    const windowId = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH }).window?.id;

    windows.remove(BITWARDEN_ID, windowId);

    expect(events).toEqual([`opened ${BITWARDEN_ID} ${windowId}`]);
  });

  test("reports no user close for a window an unload closed", () => {
    const { windows } = createFakeEmbedder();

    const events = watchEvents(windows);

    const windowId = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH }).window?.id;

    windows.closeExtensionWindows(BITWARDEN_ID);

    expect(events).toEqual([`opened ${BITWARDEN_ID} ${windowId}`]);
  });

  test("reports no second opening for a create that focused the window already open", () => {
    const { windows } = createFakeEmbedder();

    const events = watchEvents(windows);

    windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    expect(events).toHaveLength(1);
  });
});

describe("Windows.getWindowIdOfFrame", () => {
  /*
   * What a tab's `windowId` is read from: the popout's page is in the popout,
   * which is how an extension finds it to close it, and every other page is in
   * the main window.
   */
  test("answers the window a frame's page is in, or the main window", () => {
    const { windows, openedWindows } = createFakeEmbedder();

    const { window } = windows.create(BITWARDEN_ID, { url: UNLOCK_PATH });

    expect(windows.getWindowIdOfFrame(openedWindows[0]?.frame as WebFrameMain)).toBe(
      window?.id as number,
    );

    expect(windows.getWindowIdOfFrame({} as WebFrameMain)).toBe(MAIN_WINDOW_ID);

    openedWindows[0]?.close();

    expect(windows.getWindowIdOfFrame(openedWindows[0]?.frame as WebFrameMain)).toBe(
      MAIN_WINDOW_ID,
    );
  });
});

/** The bridge's end of it, which is the shape the facade reads. */
describe("Windows routes", () => {
  function registerRoutes({ opensWindows }: { opensWindows?: string[] } = {}) {
    const { windows, openedWindows } = createFakeEmbedder(
      opensWindows ? { opensWindows } : undefined,
    );

    const routes = new Map<string, ExtensionBridgeHandler>();

    windows.registerRoutes({
      handle: (pathname, handler) => {
        routes.set(pathname, handler);
      },
    } as ExtensionBridge);

    return {
      openedWindows,
      call: async (
        pathname: string,
        body: Record<string, unknown>,
        {
          extensionId = BITWARDEN_ID,
          senderFrame,
        }: { extensionId?: string; senderFrame?: WebFrameMain } = {},
      ) => {
        const handler = routes.get(pathname) as ExtensionBridgeHandler;

        const response = await handler({
          session: undefined as unknown as Session,
          extensionId,
          senderFrame,
          body,
          headers: {},
        });

        return (await response.json()) as WindowsWindowResponse | null;
      },
      /** Parks an events stream for the extension and collects what reaches it. */
      listen: async (extensionId = BITWARDEN_ID) => {
        const handler = routes.get(WINDOWS_PATHS.events) as ExtensionBridgeHandler;

        const response = await handler({
          session: undefined as unknown as Session,
          extensionId,
          senderFrame: undefined,
          body: {},
          headers: {},
        });

        const reader = (response.body as ReadableStream<Uint8Array>).getReader();

        const decoder = new NativeMessageDecoder();

        const frames: WindowsEventFrame[] = [];

        void (async () => {
          for (;;) {
            const { value, done } = await reader.read();

            if (done) {
              return;
            }

            frames.push(...(decoder.push(value) as WindowsEventFrame[]));
          }
        })();

        return frames;
      },
    };
  }

  function settle() {
    return new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  /*
   * However the window goes — the user closing it, which is no call of the
   * extension's at all, or its own `remove` — every context of the extension
   * that listens hears it, and no other extension does.
   */
  test("tells the extension's parked streams when one of its windows is gone", async () => {
    const { call, listen, openedWindows } = registerRoutes();

    const workerFrames = await listen();

    const pageFrames = await listen();

    const otherExtensionFrames = await listen(ONEPASSWORD_ID);

    const closedByUser = await call(WINDOWS_PATHS.create, { createData: { url: UNLOCK_PATH } });

    const removed = await call(WINDOWS_PATHS.create, { createData: { url: "popup/index.html" } });

    openedWindows[0]?.close();

    await call(WINDOWS_PATHS.remove, { windowId: removed?.window?.id });

    await settle();

    const expected: WindowsEventFrame[] = [
      { type: "removed", windowId: closedByUser?.window?.id as number },
      { type: "removed", windowId: removed?.window?.id as number },
    ];

    expect(workerFrames).toEqual(expected);

    expect(pageFrames).toEqual(expected);

    expect(otherExtensionFrames).toEqual([]);
  });

  test("answers a create with the window it opened", async () => {
    const { call, openedWindows } = registerRoutes();

    const answer = await call(WINDOWS_PATHS.create, {
      createData: { url: UNLOCK_PATH, type: "popup" },
    });

    expect(answer?.window).toMatchObject({ id: 2, type: "popup" });

    expect(openedWindows).toHaveLength(1);
  });

  test("answers a refused create with the reason the extension is told", async () => {
    const { call } = registerRoutes();

    const answer = await call(WINDOWS_PATHS.create, {
      createData: { url: "https://vault.bitwarden.com/" },
    });

    expect(answer?.window).toBeNull();

    expect(answer?.error).toBeString();
  });

  test("closes the window a remove names, and answers nothing", async () => {
    const { call, openedWindows } = registerRoutes();

    const created = await call(WINDOWS_PATHS.create, { createData: { url: UNLOCK_PATH } });

    expect(await call(WINDOWS_PATHS.remove, { windowId: created?.window?.id })).toBeNull();

    expect(openedWindows[0]?.isClosed).toBe(true);
  });

  test("answers a get with no window id from the calling frame", async () => {
    const { call, openedWindows } = registerRoutes();

    const created = await call(WINDOWS_PATHS.create, { createData: { url: UNLOCK_PATH } });

    const answer = await call(WINDOWS_PATHS.get, {}, { senderFrame: openedWindows[0]?.frame });

    expect(answer?.window?.id).toBe(created?.window?.id as number);
  });
});
