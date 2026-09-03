import { describe, expect, test } from "bun:test";
import type { OnBeforeSendHeadersListenerDetails, Session, WebContents } from "electron";
import { ExtensionBridge } from "../bridge/bridge";
import { getExtensionBridgeUrl } from "../bridge/protocol";
import {
  noTabError,
  type RuntimeProxyTab,
  type RuntimeProxyWorkerGetTabResult,
  type RuntimeProxyWorkerQueryTabsResult,
  RUNTIME_PROXY_PATHS,
} from "./bridge-protocol";
import { WorkerTabs } from "./worker-tabs";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const WORKER_TOKEN = "worker-token";

const SHIM_TOKEN = "shim-token";

type BeforeSendHeadersListener = (
  details: OnBeforeSendHeadersListenerDetails,
  callback: (response: { requestHeaders?: Record<string, string> }) => void,
) => void;

/**
 * A session the bridge can be set up on, which is all these routes need: they
 * carry no sender report, so nothing here depends on a caller frame.
 */
function createFakeSession() {
  let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

  let beforeSendHeadersListener: BeforeSendHeadersListener | null = null;

  const session = {
    protocol: {
      handle: (_scheme: string, handler: (request: GlobalRequest) => Promise<Response>) => {
        requestHandler = handler;
      },
      unhandle: () => {
        requestHandler = undefined;
      },
    },
    webRequest: {
      onBeforeSendHeaders: (
        filterOrListener: unknown,
        maybeListener?: BeforeSendHeadersListener | null,
      ) => {
        beforeSendHeadersListener =
          maybeListener === undefined
            ? (filterOrListener as BeforeSendHeadersListener | null)
            : maybeListener;
      },
    },
  } as unknown as Session;

  return {
    session,
    request: (pathName: string, bridgeToken: string, body: Record<string, unknown>) => {
      const url = getExtensionBridgeUrl(pathName, bridgeToken);

      let requestHeaders: Record<string, string> = {};

      beforeSendHeadersListener?.(
        { url, frame: null, requestHeaders } as OnBeforeSendHeadersListenerDetails,
        ({ requestHeaders: stampedHeaders }) => {
          if (stampedHeaders) {
            requestHeaders = stampedHeaders;
          }
        },
      );

      return requestHandler?.(
        new Request(url, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify(body),
        }) as GlobalRequest,
      ) as Promise<Response>;
    },
  };
}

type FakeContentsOptions = {
  title?: string;
  isDestroyed?: boolean;
  isFocused?: boolean;
  isCurrentlyAudible?: boolean;
  isAudioMuted?: boolean;
};

function createContents(
  contentsId: number,
  session: Session,
  url: string,
  {
    title = "A page",
    isDestroyed = false,
    isFocused = false,
    isCurrentlyAudible = false,
    isAudioMuted = false,
  }: FakeContentsOptions = {},
) {
  return {
    id: contentsId,
    session,
    getURL: () => url,
    getTitle: () => title,
    isDestroyed: () => isDestroyed,
    isLoading: () => false,
    isFocused: () => isFocused,
    isCurrentlyAudible: () => isCurrentlyAudible,
    isAudioMuted: () => isAudioMuted,
  } as unknown as WebContents;
}

const PAGE_URL = "https://accounts.google.com/signin";

const SECOND_PAGE_URL = "https://mail.google.com/mail/u/0/";

const WORKER_PAGE_URL = "https://127.0.0.1/worker-page";

type Harness = {
  isActiveTab?: (contents: WebContents) => boolean;
  /** Whether the shimmed session ever adopted the content-script-only role. */
  isShimmed?: boolean;
};

function createHarness({ isActiveTab, isShimmed = true }: Harness = {}) {
  const workerSession = createFakeSession();

  const shimSession = createFakeSession();

  /** A session the shared instance never adopted, whose tabs stay invisible. */
  const strangerSession = createFakeSession();

  const bridge = new ExtensionBridge();

  bridge.setupSession(workerSession.session, {
    getExtensionId: (bridgeToken) => (bridgeToken === WORKER_TOKEN ? EXTENSION_ID : undefined),
  });

  bridge.setupSession(shimSession.session, {
    getExtensionId: (bridgeToken) => (bridgeToken === SHIM_TOKEN ? EXTENSION_ID : undefined),
  });

  const shimTab = createContents(7, shimSession.session, PAGE_URL);

  const secondShimTab = createContents(8, shimSession.session, SECOND_PAGE_URL, {
    title: "Inbox",
    isCurrentlyAudible: true,
    isAudioMuted: true,
  });

  const workerTab = createContents(9, workerSession.session, WORKER_PAGE_URL, {
    isFocused: true,
  });

  const strangerTab = createContents(10, strangerSession.session, PAGE_URL);

  const destroyedTab = createContents(11, shimSession.session, PAGE_URL, { isDestroyed: true });

  const allContents = [shimTab, secondShimTab, workerTab, strangerTab, destroyedTab];

  const workerTabs = new WorkerTabs({
    getWorkerSession: () => workerSession.session,
    isShimmedSession: (session) => isShimmed && session === shimSession.session,
    isActiveTab,
    getAllWebContents: () => allContents,
    getWebContentsById: (tabId) => allContents.find((contents) => contents.id === tabId),
  });

  workerTabs.registerRoutes(bridge);

  const query = async (queryInfo?: Record<string, unknown>) => {
    const response = await workerSession.request(
      RUNTIME_PROXY_PATHS.workerQueryTabs,
      WORKER_TOKEN,
      { queryInfo },
    );

    expect(response.status).toBe(200);

    return ((await response.json()) as RuntimeProxyWorkerQueryTabsResult).tabs;
  };

  const getTab = async (tabId: unknown) => {
    const response = await workerSession.request(RUNTIME_PROXY_PATHS.workerGetTab, WORKER_TOKEN, {
      tabId,
    });

    expect(response.status).toBe(200);

    return (await response.json()) as RuntimeProxyWorkerGetTabResult;
  };

  return {
    workerTabs,
    workerSession,
    shimSession,
    shimTab,
    secondShimTab,
    workerTab,
    strangerTab,
    query,
    getTab,
  };
}

const tabIds = (tabs: RuntimeProxyTab[]) => tabs.map((tab) => tab.id);

describe("tabs.query from the worker", () => {
  test("is refused from any session but the worker's", async () => {
    const { shimSession } = createHarness();

    const queryResponse = await shimSession.request(
      RUNTIME_PROXY_PATHS.workerQueryTabs,
      SHIM_TOKEN,
      {},
    );

    expect(queryResponse.status).toBe(403);

    const getResponse = await shimSession.request(RUNTIME_PROXY_PATHS.workerGetTab, SHIM_TOKEN, {
      tabId: 7,
    });

    expect(getResponse.status).toBe(403);
  });

  /*
   * The whole point: Chromium lists the worker session's own pages and nothing
   * else, which is nothing an account is looking at. What main adds is the
   * sessions the one worker shims — and only those, so an account session this
   * never adopted stays as invisible as it is to every other account.
   */
  test("lists the worker's own session and every session it shims, and no other", async () => {
    const { query, strangerTab } = createHarness();

    expect(tabIds(await query())).toEqual([7, 8, 9]);

    expect(strangerTab.id).toBe(10);
  });

  test("lists nothing of another session while no session is shimmed", async () => {
    const { query } = createHarness({ isShimmed: false });

    expect(tabIds(await query())).toEqual([9]);
  });

  test("a page that is gone is no tab, whatever the list still holds", async () => {
    const { query } = createHarness();

    expect(tabIds(await query())).not.toContain(11);
  });

  test("carries the whole tab shape, ids being WebContents ids throughout", async () => {
    const { query } = createHarness();

    const [tab] = await query({ url: PAGE_URL });

    expect(tab).toEqual({
      id: 7,
      url: PAGE_URL,
      title: "A page",
      windowId: -1,
      index: -1,
      active: false,
      highlighted: false,
      selected: false,
      pinned: false,
      incognito: false,
      status: "complete",
      groupId: -1,
      audible: false,
      mutedInfo: { muted: false },
      discarded: false,
      autoDiscardable: true,
    });
  });

  /*
   * Chrome's `active` is "the tab its window is showing", which the embedder
   * owns; Electron's own answer is focus, and a window can show a page while
   * something else has the focus — a password manager's own unlock prompt, for
   * one, which is exactly when the worker asks.
   */
  test("takes `active` from the embedder's hook", async () => {
    const { query } = createHarness({ isActiveTab: (contents) => contents.id === 8 });

    expect(tabIds(await query({ active: true }))).toEqual([8]);

    expect(tabIds(await query({ active: false }))).toEqual([7, 9]);
  });

  test("falls back to Electron's own focus when the embedder says nothing", async () => {
    const { query } = createHarness();

    expect(tabIds(await query({ active: true }))).toEqual([9]);
  });

  test("filters on a match pattern, on several, and on every URL", async () => {
    const { query } = createHarness();

    expect(tabIds(await query({ url: "https://mail.google.com/*" }))).toEqual([8]);

    expect(
      tabIds(await query({ url: ["https://mail.google.com/*", "https://accounts.google.com/*"] })),
    ).toEqual([7, 8]);

    expect(tabIds(await query({ url: "<all_urls>" }))).toEqual([7, 8, 9]);

    expect(tabIds(await query({ url: "https://example.com/*" }))).toEqual([]);
  });

  test("filters on audio, both what is playing and what is muted", async () => {
    const { query } = createHarness();

    expect(tabIds(await query({ audible: true }))).toEqual([8]);

    expect(tabIds(await query({ muted: true }))).toEqual([8]);

    expect(tabIds(await query({ muted: false }))).toEqual([7, 9]);
  });

  test("filters on a title glob, the way Chrome's own filter reads one", async () => {
    const { query } = createHarness();

    expect(tabIds(await query({ title: "Inbox" }))).toEqual([8]);

    expect(tabIds(await query({ title: "A p*" }))).toEqual([7, 9]);
  });

  /*
   * Everything Electron's own query ignores is ignored here too, so an
   * extension gets one answer whichever session it asks from. There is one
   * window in the facade's model anyway — `windows` answers a single fake
   * window — so a window filter has nothing to narrow.
   */
  test("ignores the keys Electron ignores rather than answering nothing", async () => {
    const { query } = createHarness();

    expect(
      tabIds(
        await query({
          windowId: 42,
          currentWindow: true,
          lastFocusedWindow: true,
          index: 3,
          pinned: true,
          status: "loading",
          groupId: 7,
        }),
      ),
    ).toEqual([7, 8, 9]);
  });

  test("a queryInfo that is no object at all filters nothing", async () => {
    const { query } = createHarness();

    expect(tabIds(await query())).toEqual([7, 8, 9]);

    expect(tabIds(await query("everything" as unknown as Record<string, unknown>))).toEqual([
      7, 8, 9,
    ]);
  });
});

describe("tabs.get from the worker", () => {
  test("answers a tab of a session the worker shims", async () => {
    const { getTab } = createHarness();

    expect(await getTab(7)).toEqual({
      status: "tab",
      tab: expect.objectContaining({ id: 7, url: PAGE_URL }),
    });
  });

  test("answers a tab of the worker's own session too", async () => {
    const { getTab } = createHarness();

    expect(await getTab(9)).toEqual({
      status: "tab",
      tab: expect.objectContaining({ id: 9, url: WORKER_PAGE_URL }),
    });
  });

  /*
   * A tab of a session this never adopted is answered the way a tab that does
   * not exist is: the worker has no business reading it, and saying so with
   * Chrome's own error is the same line `tabs.sendMessage` draws.
   */
  test("a tab of an un-adopted session is no tab, and says so Chrome's way", async () => {
    const { getTab } = createHarness();

    expect(await getTab(10)).toEqual({ status: "noTarget", error: noTabError(10) });
  });

  test("a destroyed tab, an unknown id and a garbage id are all no tab", async () => {
    const { getTab } = createHarness();

    expect(await getTab(11)).toEqual({ status: "noTarget", error: noTabError(11) });

    expect(await getTab(404)).toEqual({ status: "noTarget", error: noTabError(404) });

    expect(await getTab("7")).toEqual({ status: "noTarget", error: noTabError("7") });
  });
});
