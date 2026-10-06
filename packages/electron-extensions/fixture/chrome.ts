/**
 * The slice of Chrome's extension API the fixture extension uses, typed by
 * hand: the repository carries no `@types/chrome`, and the facade's own
 * `ChromeNamespace` is deliberately an opaque bag. Only what the fixture
 * calls is declared, so a call outside this slice is a type error rather
 * than an untyped reach into the namespace.
 */

export type FixtureTab = {
  id?: number;
  url?: string;
  active?: boolean;
};

export type FixtureMessageSender = {
  id?: string;
  url?: string;
  origin?: string;
  frameId?: number;
  tab?: FixtureTab;
};

export type FixtureEvent<Listener> = {
  addListener: (listener: Listener) => void;
};

export type FixturePort = {
  name: string;
  sender?: FixtureMessageSender;
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: FixtureEvent<(message: unknown) => void>;
  onDisconnect: FixtureEvent<() => void>;
};

export type FixtureManifest = {
  [manifestKey: string]: unknown;
  background?: unknown;
};

/** The slice of `chrome.tabs` the fixture's worker drives. */
export type FixtureTabs = {
  sendMessage: (
    tabId: number,
    message: unknown,
    options: { frameId?: number },
    callback: (reply: unknown) => void,
  ) => void;
  connect: (tabId: number, connectInfo: { name: string; frameId?: number }) => FixturePort;
  /**
   * The two the worker sees only its own session's tabs through natively, which
   * is none of an account's — the callback form, since `lastError` is what a
   * `get` for a tab that is not there reports itself with.
   */
  query: (queryInfo: Record<string, unknown>, callback: (tabs: FixtureTab[]) => void) => void;
  get: (tabId: number, callback: (tab: FixtureTab | undefined) => void) => void;
};

/** One frame as `chrome.webNavigation` describes it, in the slice the fixture reads. */
export type FixtureFrameDetails = {
  frameId: number;
  parentFrameId: number;
  url: string;
};

/** The slice of `chrome.webNavigation` the fixture's worker asks. */
export type FixtureWebNavigation = {
  getFrame: (
    query: { tabId: number; frameId: number },
    callback: (frame: FixtureFrameDetails | null) => void,
  ) => void;
};

/** One key's entry in an `onChanged`, in Chrome's own shape. */
export type FixtureStorageChange = {
  oldValue?: unknown;
  newValue?: unknown;
};

export type FixtureStorageChanges = Record<string, FixtureStorageChange>;

/**
 * The `StorageArea` slice the fixture uses, in the callback form, which is
 * where `runtime.lastError` is readable — and a refusal is what one of the
 * probes is here to see.
 *
 * `onChanged` is the per-area event, which hears the changes alone where the
 * one on `chrome.storage` is told the area's name as well; a probe listens on
 * both, because in a shimmed session both are the proxy's rather than Chrome's.
 * Both are optional, because Electron implements only some of Chrome's surface
 * and the probes feature-detect them rather than assume them.
 */
export type FixtureStorageArea = {
  get: (keys: string | null, callback: (items: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>, callback: () => void) => void;
  onChanged?: FixtureEvent<(changes: FixtureStorageChanges) => void>;
};

export type FixtureStorage = {
  local: FixtureStorageArea;
  session: FixtureStorageArea;
  onChanged?: FixtureEvent<(changes: FixtureStorageChanges, areaName: string) => void>;
};

export type FixtureRuntime = {
  id: string;
  lastError?: { message?: string };
  getManifest?: () => FixtureManifest;
  sendMessage: (message: unknown, callback: (reply: unknown) => void) => void;
  connect: (connectInfo: { name: string }) => FixturePort;
  getURL?: (path: string) => string;
  onMessage: FixtureEvent<
    (
      message: unknown,
      sender: FixtureMessageSender,
      sendResponse: (reply: unknown) => void,
      // `true` keeps the message channel open for an answer that comes later
    ) => boolean | undefined
  >;
  onConnect: FixtureEvent<(port: FixturePort) => void>;
};

/**
 * The `chrome` global of whatever extension context this runs in — the
 * service worker, a content script's isolated world, or an extension page.
 * In a content-script-only derived copy the runtime proxy's shim has already
 * shadowed `runtime.sendMessage` and `runtime.connect` by the time the
 * fixture's scripts run, which is exactly what the fixture is here to
 * exercise.
 */
export function getChromeRuntime(): FixtureRuntime {
  const contextGlobals = globalThis as unknown as { chrome: { runtime: FixtureRuntime } };

  return contextGlobals.chrome.runtime;
}

/**
 * The worker's `chrome.tabs`, whose `sendMessage`, `connect`, `query` and
 * `get` the relay client has shadowed by the time the fixture's background
 * script runs — the worker-to-page direction, all four of which natively see
 * the worker session's own tabs alone.
 */
export function getChromeTabs(): FixtureTabs {
  const workerGlobals = globalThis as unknown as { chrome: { tabs: FixtureTabs } };

  return workerGlobals.chrome.tabs;
}

/**
 * The worker's `chrome.webNavigation`, which is the facade's throughout —
 * Electron implements none of the namespace. A frame query names a tab of
 * another session here, the worker session holding no account's tabs, which
 * is what the loader has to be willing to answer.
 */
export function getChromeWebNavigation(): FixtureWebNavigation {
  const workerGlobals = globalThis as unknown as {
    chrome: { webNavigation: FixtureWebNavigation };
  };

  return workerGlobals.chrome.webNavigation;
}

/**
 * The `chrome.storage` of whatever context this runs in. In a
 * content-script-only derived copy the runtime proxy's shim has already
 * shadowed the area methods, so what these read and write is the one store the
 * worker's session keeps rather than this session's own.
 */
export function getChromeStorage(): FixtureStorage {
  const contextGlobals = globalThis as unknown as { chrome: { storage: FixtureStorage } };

  return contextGlobals.chrome.storage;
}
