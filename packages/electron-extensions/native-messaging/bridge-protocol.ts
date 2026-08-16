/**
 * The contract between the facade running inside an extension and the bridge
 * running in the main process, shared by both sides.
 *
 * Extension contexts have no IPC of their own — service worker preload scripts
 * never run for extension service workers on Electron 43 (see the injection
 * notes in the feature docs) — but they do have `fetch`, and a custom scheme
 * handled per session is something only the main process can answer. That is
 * the whole transport: one request per call, and the connect request's response
 * body left open to carry everything the host says back.
 */

export const NATIVE_MESSAGING_SCHEME = "extension-native-messaging";

/** Every request goes to the one bridge, so only the path varies. */
export const NATIVE_MESSAGING_ORIGIN = `${NATIVE_MESSAGING_SCHEME}://port`;

export const NATIVE_MESSAGING_PATHS = {
  connect: "/connect",
  post: "/post",
  disconnect: "/disconnect",
} as const;

/**
 * Where the derived copy of an extension leaves the secret that says a request
 * came from that extension.
 *
 * Something has to, because nothing else in the request does: Electron hands
 * the handler no `Origin` header and no sender, and the scheme is reachable
 * from any document in the session whose own policy allows it — a workspace app
 * or any page a user navigates to. The secret is written into the extension's
 * copy of the facade, which only the extension can read, and is new on every
 * launch.
 */
export const NATIVE_MESSAGING_TOKEN_GLOBAL = "__electronExtensionsNativeMessagingToken";

export type NativeMessagingRequest = {
  token: string;
};

/**
 * The port id is the extension's to choose so that it can post to a port the
 * moment `connectNative` returns, the way Chrome lets it. The bridge still owns
 * what the id may reach: a port answers only to the session and extension that
 * opened it.
 */
export type NativeMessagingConnectRequest = NativeMessagingRequest & {
  portId: string;
  hostName: string;
};

export type NativeMessagingPostRequest = NativeMessagingRequest & {
  portId: string;
  message: unknown;
};

export type NativeMessagingDisconnectRequest = NativeMessagingRequest & {
  portId: string;
};

/**
 * Frames on the connect response body, in the same length-prefixed JSON the
 * host's own stdio uses. A stream always ends with a disconnect frame, which
 * carries the error Chrome would have put on `runtime.lastError`.
 */
export type NativeMessagingFrame =
  | { type: "message"; message: unknown }
  | { type: "disconnect"; error?: string };
