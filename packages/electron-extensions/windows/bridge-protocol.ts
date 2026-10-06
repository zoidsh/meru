/**
 * What `chrome.windows` says over the extension bridge (`bridge/protocol.ts`),
 * shared by the facade and the main process.
 *
 * Only the windows the embedder opened for the extension travel here. Chrome's
 * namespace is a view of the whole browser, and nothing else an embedder draws
 * is a window an extension has business reading — Meru's one window holds
 * every account as a child view, so answering with it would describe one
 * window for however many pages the extension sees.
 *
 * A refusal carries its reason, because Chrome fails `create` for a URL it will
 * not open rather than answering a window for it, and the two have to be told
 * apart from the answer alone: no window and no reason is an embedder that
 * serves no windows at all, where the facade falls back to the fake window the
 * namespace has always answered.
 */

export const WINDOWS_PATHS = {
  create: "/windows/create",
  remove: "/windows/remove",
  get: "/windows/get",
} as const;

/** What the extension handed to `create`, taken as untrusted. */
export type WindowsCreateData = {
  url?: unknown;
  width?: unknown;
  height?: unknown;
  left?: unknown;
  top?: unknown;
  type?: unknown;
  focused?: unknown;
};

/**
 * Chrome's `windows.Window`, in the shape a window holding one extension page
 * can answer: no tab is a tab Chrome would describe, so `tabs` is empty however
 * a `populate` was asked for.
 */
export type WindowsWindow = {
  id: number;
  focused: boolean;
  incognito: false;
  alwaysOnTop: false;
  state: "normal";
  type: "popup" | "normal";
  top: number;
  left: number;
  width: number;
  height: number;
  tabs: [];
};

/** What `create` and `get` answer with. */
export type WindowsWindowResponse = {
  window: WindowsWindow | null;
  /** Why a `create` was refused, which the facade raises as the call's error. */
  error?: string;
};
