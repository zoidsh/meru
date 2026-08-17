/**
 * What native messaging says over the extension bridge (`bridge/protocol.ts`),
 * shared by the facade and the main process: one request per call, and the
 * connect request's response body left open to carry everything the host says
 * back.
 */

export const NATIVE_MESSAGING_PATHS = {
  connect: "/native-messaging/connect",
  post: "/native-messaging/post",
  disconnect: "/native-messaging/disconnect",
} as const;

/**
 * The port id is the extension's to choose so that it can post to a port the
 * moment `connectNative` returns, the way Chrome lets it. The bridge still owns
 * what the id may reach: a port answers only to the session and extension that
 * opened it.
 */
export type NativeMessagingConnectRequest = {
  portId: string;
  hostName: string;
};

export type NativeMessagingPostRequest = {
  portId: string;
  message: unknown;
};

export type NativeMessagingDisconnectRequest = {
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
