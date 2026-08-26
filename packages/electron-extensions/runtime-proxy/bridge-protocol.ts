/**
 * What the runtime proxy says over the extension bridge (`bridge/protocol.ts`),
 * shared by the content-script shim, the worker-side relay client, and the
 * main-process relay.
 *
 * The proxy carries `chrome.runtime` messaging from the contexts of a
 * worker-less session — its content scripts and its extension pages, the action
 * popup above all — to the one session that keeps the extension's service
 * worker. Their calls go up as ordinary bridge POSTs; everything flowing the
 * other way rides a streaming response body — port frames to the caller, jobs
 * to the worker — in the same length-prefixed JSON frames native messaging uses
 * (`native-messaging/framing.ts`).
 */

/** What every extension URL starts with, from a worker scope to a page's own. */
export const EXTENSION_SCHEME_PREFIX = "chrome-extension://";

export const RUNTIME_PROXY_PATHS = {
  /** Content-script side, called by the shim. */
  sendMessage: "/runtime-proxy/send-message",
  connect: "/runtime-proxy/connect",
  portPost: "/runtime-proxy/port-post",
  portDisconnect: "/runtime-proxy/port-disconnect",
  /** Worker side, called by the relay client. */
  workerJobs: "/runtime-proxy/worker-jobs",
  workerAck: "/runtime-proxy/worker-ack",
  workerReply: "/runtime-proxy/worker-reply",
  workerPortPost: "/runtime-proxy/worker-port-post",
  workerPortDisconnect: "/runtime-proxy/worker-port-disconnect",
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

/**
 * What a shimmed context can truthfully say about itself: a bridge request
 * carries no sender at all — no `Origin` header, nothing — so the shim reports
 * where it runs and the main process checks the claim against the session's
 * real frame tree before building the sender the worker sees. The bridge token
 * has already proven the caller is the extension's own — its isolated world, or
 * one of its pages. Together the two fields say which: a top-level document on
 * the extension's own scheme is an extension page, and no tab.
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

export type RuntimeProxyPortPostRequest = {
  portId: string;
  message: unknown;
};

export type RuntimeProxyPortDisconnectRequest = {
  portId: string;
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
};

/**
 * The `MessageSender` a relayed message hands the worker's listeners. `tab` and
 * `frameId` are missing when the message came from an extension page, which is
 * no tab, and when the reported frame could not be found in the session — it
 * navigated away while the message was in flight.
 */
export type RuntimeProxySender = {
  id: string;
  url: string;
  origin: string;
  frameId?: number;
  tab?: RuntimeProxyTab;
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
  | { type: "portDisconnect"; jobId: string; portId: string };

export type RuntimeProxyWorkerAckRequest = {
  jobId: string;
};

export type RuntimeProxyWorkerReplyRequest = {
  jobId: string;
  result: RuntimeProxySendMessageResult | RuntimeProxyConnectResult;
};

export type RuntimeProxyWorkerPortPostRequest = {
  portId: string;
  message: unknown;
};

export type RuntimeProxyWorkerPortDisconnectRequest = {
  portId: string;
};
