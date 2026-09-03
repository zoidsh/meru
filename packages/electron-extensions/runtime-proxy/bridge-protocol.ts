/**
 * What the runtime proxy says over the extension bridge (`bridge/protocol.ts`),
 * shared by the content-script shim, the worker-side relay client, and the
 * main-process relay.
 *
 * The proxy carries `chrome.runtime` messaging from the contexts of a
 * worker-less session — its content scripts and its extension pages, the action
 * popup above all — to the one session that keeps the extension's service
 * worker, and back the other way — `tabs.sendMessage`, `tabs.connect` and the
 * `runtime.sendMessage` broadcast the worker starts itself.
 *
 * Calls go up as ordinary bridge POSTs in both directions; everything pushed
 * rides a streaming response body — jobs to the worker, port frames to a port's
 * caller, and envelopes to a shimmed context's parked page stream — in the same
 * length-prefixed JSON frames native messaging uses
 * (`native-messaging/framing.ts`).
 */

import type {
  RuntimeProxyStorageAccessLevel,
  RuntimeProxyStorageAreaName,
  RuntimeProxyStorageCall,
  RuntimeProxyStorageChanges,
  RuntimeProxyStorageResult,
} from "./storage-protocol";

/**
 * The global the relay client installs for the derived service worker wrapper
 * to call, as the last thing the wrapper does. Parking the job stream there
 * rather than during the relay's own module evaluation is what keeps a job
 * from reaching the worker before the extension's top-level code has run —
 * which is the ordering Chrome itself guarantees, since it dispatches nothing
 * to a service worker until its script has finished evaluating.
 */
export const RUNTIME_PROXY_RELAY_START_GLOBAL = "__meruRuntimeProxyStartRelay";

/**
 * Where the derived content-script-only copy leaves the manifest the shim
 * answers `chrome.runtime.getManifest()` with: the *worker* role's derived
 * manifest, since the worker copy is the one instance every session shares and
 * what its `getManifest` returns is the answer they all have to agree on.
 *
 * It rides the shim's own script the way the bridge token rides the facade's,
 * because `getManifest` is synchronous — there is no asking the bridge for it —
 * and the shim runs in isolated worlds the facade never reaches.
 */
export const RUNTIME_PROXY_MANIFEST_GLOBAL = "__meruRuntimeProxyManifest";

/** What every extension URL starts with, from a worker scope to a page's own. */
export const EXTENSION_SCHEME_PREFIX = "chrome-extension://";

export const RUNTIME_PROXY_PATHS = {
  /** Content-script side, called by the shim. */
  sendMessage: "/runtime-proxy/send-message",
  connect: "/runtime-proxy/connect",
  portPost: "/runtime-proxy/port-post",
  portDisconnect: "/runtime-proxy/port-disconnect",
  storageCall: "/runtime-proxy/storage-call",
  /** Content-script side again, for what the worker sends of its own accord. */
  pageStream: "/runtime-proxy/page-stream",
  pageReply: "/runtime-proxy/page-reply",
  /** Worker side, called by the relay client. */
  workerJobs: "/runtime-proxy/worker-jobs",
  workerAck: "/runtime-proxy/worker-ack",
  workerReply: "/runtime-proxy/worker-reply",
  workerPortPost: "/runtime-proxy/worker-port-post",
  workerPortDisconnect: "/runtime-proxy/worker-port-disconnect",
  workerStorageAccessLevel: "/runtime-proxy/worker-storage-access-level",
  workerStorageChanged: "/runtime-proxy/worker-storage-changed",
  /** Worker side again, for the calls that start in the worker. */
  workerSendToTab: "/runtime-proxy/worker-send-to-tab",
  workerConnectToTab: "/runtime-proxy/worker-connect-to-tab",
  workerBroadcast: "/runtime-proxy/worker-broadcast",
  workerQueryTabs: "/runtime-proxy/worker-query-tabs",
  workerGetTab: "/runtime-proxy/worker-get-tab",
} as const;

/**
 * Far past any `chrome.runtime` message's business, but native messaging's
 * 1 MB cap is one Chrome does not apply to runtime messaging, so the proxy's
 * streams get a cap of their own rather than inheriting that one.
 */
export const MAX_RUNTIME_PROXY_FRAME_BYTES = 64 * 1024 * 1024;

/** Chrome's own words, so extensions match on what they already handle. */
export const RECEIVING_END_ERROR = "Could not establish connection. Receiving end does not exist.";

export const PORT_CLOSED_ERROR = "The message port closed before a response was received.";

/** Chrome's words again, for a tab id that names nothing this app is showing. */
export function noTabError(tabId: unknown) {
  return `No tab with id: ${String(tabId)}.`;
}

/**
 * And for a frame the tab does not have. Chrome answers the same way for a
 * `documentId`, which the proxy never matches: Electron has no document ids and
 * no relayed sender carries one, so an extension has nothing true to pass back.
 */
export function noFrameError(frameId: unknown, tabId: unknown) {
  return `No frame with id ${String(frameId)} in tab with id ${String(tabId)}.`;
}

export function noDocumentError(documentId: unknown, tabId: unknown) {
  return `No document with id ${String(documentId)} in tab with id ${String(tabId)}.`;
}

/**
 * What a shimmed context can truthfully say about itself: a bridge request's
 * body carries no sender of its own — no `Origin` header, nothing — so the shim
 * reports where it runs and the main process holds the claim against the frame
 * Chromium recorded as the request's caller (`bridge/bridge.ts`) before
 * building the sender the worker sees. The bridge token has already proven the
 * caller is the extension's own — its isolated world, or one of its pages.
 * Together the two fields say which: a top-level document on the extension's
 * own scheme is an extension page, and no tab.
 */
export type RuntimeProxySenderReport = {
  url: string;
  isTopFrame: boolean;
};

export type RuntimeProxySendMessageRequest = {
  message: unknown;
  sender: RuntimeProxySenderReport;
};

/**
 * How a relayed `sendMessage` ended, mapped by the shim onto Chrome's own
 * behavior: a reply, "receiving end does not exist" when nothing listens, and
 * "message port closed" when a listener took the message and never answered.
 */
export type RuntimeProxySendMessageResult =
  | { status: "replied"; reply?: unknown }
  | { status: "noListener" }
  | { status: "closed" };

export type RuntimeProxyConnectRequest = {
  /**
   * The shim's to choose, like a native messaging port id, so it can post the
   * moment `connect` returns. The relay still owns what the id may reach: a
   * port answers only to the session and extension that opened it.
   */
  portId: string;
  name?: string;
  sender: RuntimeProxySenderReport;
};

export type RuntimeProxyConnectResult = { status: "connected" } | { status: "noListener" };

/**
 * One `chrome.storage` call from a shimmed context. The sender report is the
 * same one messaging sends, and serves a narrower purpose here: the relay
 * holds it against the frame Chromium recorded as the caller to decide whether
 * the caller is one of the extension's own documents, which Chrome treats as a
 * trusted context, or a content script, which it does not.
 */
export type RuntimeProxyStorageCallRequest = {
  call: RuntimeProxyStorageCall;
  sender: RuntimeProxySenderReport;
};

/**
 * The access level the extension's worker just set for an area, reported by
 * the relay client so the relay can refuse a content script the same call
 * Chromium would refuse it. Reported rather than asked for, because Chrome has
 * no way to read an access level back.
 */
export type RuntimeProxyWorkerStorageAccessLevelRequest = {
  area: RuntimeProxyStorageAreaName;
  accessLevel: RuntimeProxyStorageAccessLevel;
};

/**
 * One `chrome.storage.onChanged` the worker's own store just fired, reported
 * so main can fan it out to every shimmed context of the extension — which is
 * the whole of `onChanged` in those sessions, their own stores being the thing
 * nothing writes any more.
 *
 * The level is the worker's record for the area at the moment the change
 * fired, and it travels with the change rather than being looked up in main
 * alone: main's own record is written by a separate POST that can land after
 * this one, so a change is held against both.
 */
export type RuntimeProxyWorkerStorageChangedRequest = {
  area: RuntimeProxyStorageAreaName;
  changes: RuntimeProxyStorageChanges;
  accessLevel: RuntimeProxyStorageAccessLevel;
};

export type RuntimeProxyPortPostRequest = {
  portId: string;
  message: unknown;
};

export type RuntimeProxyPortDisconnectRequest = {
  portId: string;
  /**
   * Which of the port's page-side ends is hanging up, for a port the worker
   * opened across several frames of a tab; the caller frame decides it when
   * absent, and a stamp the bridge could not record leaves neither.
   */
  contextId?: string;
  /**
   * Why, where Chrome has a word for it. Named rather than spelled out: the
   * `lastError` the worker reads is the main process's own string, never one a
   * renderer wrote. Only `noListener` exists, for a frame that took the connect
   * and had nothing registered to hand the port to.
   */
  reason?: "noListener";
};

/**
 * Frames on a connect response body, streamed to the shim's port. A stream that
 * ends without a disconnect frame means the bridge itself went away.
 */
export type RuntimeProxyPortFrame =
  | { type: "message"; message: unknown }
  | { type: "disconnect"; error?: string };

/** `chrome.tabs.Tab`, as much of it as the main process can honestly build. */
export type RuntimeProxyTab = {
  id: number;
  url: string;
  title: string;
  windowId: number;
  index: number;
  active: boolean;
  highlighted: boolean;
  pinned: boolean;
  incognito: boolean;
  status: "loading" | "complete";
  groupId: number;
  selected: boolean;
  audible: boolean;
  /**
   * Chrome's own shape, minus the `reason` it fills when something other than
   * the user did the muting: Electron reports whether a page is muted and never
   * says who asked.
   */
  mutedInfo: { muted: boolean };
  discarded: boolean;
  autoDiscardable: boolean;
};

/**
 * The `MessageSender` a relayed message hands the worker's listeners. Only `id`
 * is always there: everything else is held back unless the frame Chromium
 * recorded as the request's caller backs the report, so a report the caller's
 * own frame does not back — the page navigated away while the message was in
 * flight, or the report was never true — arrives carrying nothing but the
 * extension's own id. `tab` and `frameId` are missing on top of that when the
 * message came from an extension page, which is no tab.
 */
export type RuntimeProxySender = {
  id: string;
  url?: string;
  origin?: string;
  frameId?: number;
  tab?: RuntimeProxyTab;
  /**
   * Always `"active"`: the frame is the one Chromium recorded as the request's
   * caller and the sender is built while it is alive, so it is never a
   * prerendered or back-forward-cached document.
   */
  documentLifecycle?: "active";
};

/**
 * Frames on the worker-jobs response body. Every job is acked by id the moment
 * the relay client takes it (`workerAck`), which is what tells a job handed to
 * a stream just before the worker stopped apart from one the worker has:
 * un-acked jobs are delivered again on the next stream, acked ones are not.
 */
export type RuntimeProxyJob =
  | { type: "sendMessage"; jobId: string; message: unknown; sender: RuntimeProxySender }
  | { type: "connect"; jobId: string; portId: string; name?: string; sender: RuntimeProxySender }
  | { type: "portMessage"; jobId: string; portId: string; message: unknown }
  | { type: "portDisconnect"; jobId: string; portId: string; error?: string }
  | {
      type: "storage";
      jobId: string;
      call: RuntimeProxyStorageCall;
      /**
       * Whether the caller was one of the extension's own documents, decided
       * in main from the frame Chromium recorded. The worker holds the call
       * against this and its own record of the access level, which is the
       * check that cannot be stale: main's record is updated by a POST the
       * worker sends, and that POST can land after the job did.
       */
      isTrustedContext: boolean;
    };

export type RuntimeProxyWorkerAckRequest = {
  jobId: string;
};

export type RuntimeProxyWorkerReplyRequest = {
  jobId: string;
  result: RuntimeProxySendMessageResult | RuntimeProxyConnectResult | RuntimeProxyStorageResult;
};

export type RuntimeProxyWorkerPortPostRequest = {
  portId: string;
  message: unknown;
};

export type RuntimeProxyWorkerPortDisconnectRequest = {
  portId: string;
};

/**
 * What a shimmed context says when it parks its receive stream: the same claim
 * every other call carries, held against the frame the bridge recorded, so main
 * knows which tab and which frame the stream belongs to before it addresses it.
 *
 * The stream is the page-side mirror of `workerJobs` — everything the worker
 * starts rides it — and every shimmed context parks one as the shim installs,
 * before any of the extension's own code runs. Unconditionally rather than on
 * the first listener: `chrome.storage`'s `onChanged` fan-out rides the same
 * stream, so a trigger tied to `runtime`'s listeners would be a switch shared
 * between features that know nothing about each other.
 */
export type RuntimeProxyPageStreamRequest = {
  sender: RuntimeProxySenderReport;
};

/**
 * Frames on a page stream's response body. `kind` is the discriminator the
 * channel is generic in: `chrome.storage`'s change events ride here as a kind
 * of their own rather than on a second stream.
 *
 * Only `message` is answered, over `pageReply` and by `deliveryId`; the port
 * kinds are told apart by `portId`, which the worker minted. `storageChanged`
 * carries no id at all, being an event rather than a call — Chrome's own
 * `onChanged` has no reply, no sender and no receiving end to be missing, so
 * there is nothing for a context to say back about one.
 */
export type RuntimeProxyPageEnvelope =
  /**
   * Always first, naming the context to the client that just parked, so what it
   * says later about itself — which end of a many-framed port hung up — does
   * not depend on the bridge having recorded a caller stamp for that request.
   */
  | { kind: "ready"; contextId: string }
  | { kind: "message"; deliveryId: string; message: unknown; sender: RuntimeProxySender }
  | { kind: "connect"; portId: string; name?: string; sender: RuntimeProxySender }
  | { kind: "portMessage"; portId: string; message: unknown }
  | { kind: "portDisconnect"; portId: string; error?: string }
  | {
      kind: "storageChanged";
      area: RuntimeProxyStorageAreaName;
      changes: RuntimeProxyStorageChanges;
    };

export type RuntimeProxyPageReplyRequest = {
  deliveryId: string;
  result: RuntimeProxySendMessageResult;
};

/**
 * Where a worker's `tabs.sendMessage` or `tabs.connect` is aimed. `frameId` is
 * honored against the frame-tree-node ids the rest of the proxy addresses
 * frames by; `documentId` is carried only so it can be refused, since nothing
 * here can mint one an extension would recognize.
 */
export type RuntimeProxyTabTarget = {
  tabId: number;
  frameId?: number;
  documentId?: string;
};

/**
 * Where the worker says it is running, so the sender a shimmed listener sees
 * carries the worker's script URL the way Chrome's does. Main takes it only
 * when it is a URL of the extension the token already named.
 */
export type RuntimeProxyWorkerOrigin = {
  workerUrl?: string;
};

export type RuntimeProxyWorkerSendToTabRequest = RuntimeProxyTabTarget &
  RuntimeProxyWorkerOrigin & {
    message: unknown;
  };

export type RuntimeProxyWorkerConnectToTabRequest = RuntimeProxyTabTarget &
  RuntimeProxyWorkerOrigin & {
    portId: string;
    name?: string;
  };

export type RuntimeProxyWorkerBroadcastRequest = RuntimeProxyWorkerOrigin & {
  message: unknown;
};

/**
 * How a call the worker started ended. The message statuses are the same three
 * the other direction uses, and `ownSession` is the relay saying the target is
 * a tab of the worker's own session — where Chromium's native messaging works
 * and the relay has no business — which is the relay client's cue to make the
 * native call after all. `noTarget` carries Chrome's own error for a tab or
 * frame that does not exist.
 */
export type RuntimeProxyWorkerSendToTabResult =
  | RuntimeProxySendMessageResult
  | { status: "ownSession" }
  | { status: "noTarget"; error: string };

export type RuntimeProxyWorkerConnectToTabResult =
  | RuntimeProxyConnectResult
  | { status: "ownSession" }
  | { status: "noTarget"; error: string };

/**
 * What a worker's `chrome.tabs.query` filters on, which is what Electron's own
 * query honors and no more: `windowId`, `currentWindow`, `lastFocusedWindow`,
 * `index`, `pinned`, `status`, `groupId` and the rest are ignored there, and
 * ignoring them here keeps one answer rather than two. The facade shows one
 * window anyway (`windows` answers a single fake window, id 1), so a window
 * filter has nothing to narrow.
 *
 * `url` is one or more Chrome match patterns and `title` a glob, as Chrome
 * documents them; both are matched against what the page is showing now.
 */
export type RuntimeProxyTabQueryInfo = {
  active?: boolean;
  audible?: boolean;
  muted?: boolean;
  url?: string | string[];
  title?: string;
};

export type RuntimeProxyWorkerQueryTabsRequest = {
  queryInfo?: RuntimeProxyTabQueryInfo;
};

export type RuntimeProxyWorkerQueryTabsResult = {
  tabs: RuntimeProxyTab[];
};

export type RuntimeProxyWorkerGetTabRequest = {
  tabId: unknown;
};

/**
 * A tab the worker asked for by id, or Chrome's own error for one this app is
 * not showing — which is what an id of a session the worker neither keeps nor
 * shims reads as, the same line `tabs.sendMessage` draws.
 */
export type RuntimeProxyWorkerGetTabResult =
  | { status: "tab"; tab: RuntimeProxyTab }
  | { status: "noTarget"; error: string };
