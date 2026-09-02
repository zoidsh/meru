/**
 * What the runtime proxy says about `chrome.storage`, shared by the shim in a
 * content-script-only session, the worker-side relay client, and the
 * main-process relay. The transport itself is `bridge-protocol.ts`; this file
 * is the storage vocabulary it carries.
 *
 * A shared extension instance keeps one store, in the session that keeps the
 * worker. Every other session has a `chrome.storage` of its own that the
 * worker never sees, so the shim shadows the area methods and relays each call
 * to the worker, whose relay client answers it against the real store.
 */

/** The areas Chrome exposes, all of them relayed. */
export const STORAGE_AREA_NAMES = ["local", "session", "sync", "managed"] as const;

export type RuntimeProxyStorageAreaName = (typeof STORAGE_AREA_NAMES)[number];

/**
 * The `StorageArea` methods the shim shadows, and only where the session's own
 * `chrome.storage` already has one: an extension feature-detects what it can
 * call — 1Password guards its `setAccessLevel` call with `&&` — so the proxy
 * must never make a method appear that Electron does not implement, and never
 * relay one the worker's own store would not answer either.
 *
 * `onChanged` is deliberately absent; see `storage-shim.ts`.
 */
export const STORAGE_METHOD_NAMES = [
  "get",
  "getBytesInUse",
  "getKeys",
  "set",
  "remove",
  "clear",
  "setAccessLevel",
] as const;

export type RuntimeProxyStorageMethodName = (typeof STORAGE_METHOD_NAMES)[number];

export type RuntimeProxyStorageAccessLevel = "TRUSTED_CONTEXTS" | "TRUSTED_AND_UNTRUSTED_CONTEXTS";

/**
 * Chrome's own defaults, from `storage_utils.cc` `GetAccessLevelForArea`:
 * `session` is closed to content scripts until the extension opens it, and the
 * other three are open until it closes them. The relay applies these until the
 * worker's own `setAccessLevel` says otherwise, which is what an extension
 * would get natively before its worker has run.
 */
export const DEFAULT_STORAGE_ACCESS_LEVELS: Record<
  RuntimeProxyStorageAreaName,
  RuntimeProxyStorageAccessLevel
> = {
  local: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
  session: "TRUSTED_CONTEXTS",
  sync: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
  managed: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
};

/**
 * Chromium's own words for a content script reaching an area closed to it,
 * from `storage_api.cc` `SettingsFunction::PreRunValidation`. The proxy has to
 * say this itself: the call is answered in the worker, which is a privileged
 * context Chromium would never refuse, so the refusal the extension would have
 * met natively has to be reproduced before the call is relayed at all.
 */
export const STORAGE_ACCESS_DENIED_ERROR = "Access to storage is not allowed from this context.";

/**
 * Chromium's words for `setAccessLevel` called from a content script, from
 * `StorageStorageAreaSetAccessLevelFunction::Run`. No trailing period there,
 * unlike the one above; both are quoted as they are rather than tidied.
 */
export const STORAGE_ACCESS_LEVEL_CONTEXT_ERROR = "Context cannot set the storage access level";

/**
 * What a call that never reached the worker's store reads as. Chrome has no
 * equivalent — its storage is always there — so this is the proxy's own, and
 * it is deliberately about reaching the store rather than about a worker,
 * which is not a thing the extension knows it has one of.
 */
export const STORAGE_UNAVAILABLE_ERROR = "Could not reach the extension's storage.";

/** One relayed `chrome.storage` call, as the shim sends it. */
export type RuntimeProxyStorageCall = {
  area: RuntimeProxyStorageAreaName;
  method: RuntimeProxyStorageMethodName;
  /** The call's own arguments, with any trailing callback already taken off. */
  arguments: unknown[];
};

/**
 * How a relayed call ended. An error carries the message the worker's native
 * call produced — a quota overrun, a write to `managed` — so the extension
 * reads Chrome's own text rather than the proxy's paraphrase of it.
 */
export type RuntimeProxyStorageResult =
  | { status: "ok"; value?: unknown }
  | { status: "error"; message: string };

export function isStorageAreaName(value: unknown): value is RuntimeProxyStorageAreaName {
  return STORAGE_AREA_NAMES.includes(value as RuntimeProxyStorageAreaName);
}

export function isStorageMethodName(value: unknown): value is RuntimeProxyStorageMethodName {
  return STORAGE_METHOD_NAMES.includes(value as RuntimeProxyStorageMethodName);
}

export function isStorageAccessLevel(value: unknown): value is RuntimeProxyStorageAccessLevel {
  return value === "TRUSTED_CONTEXTS" || value === "TRUSTED_AND_UNTRUSTED_CONTEXTS";
}

/**
 * The error a storage call meets, or `undefined` when it may go. Both refusals
 * are Chromium's own and both have to be made by the proxy: the call is
 * answered in the worker, a privileged context Chromium would let do either.
 *
 * Applied twice, against the same rule and different records of the level.
 * Main refuses early, from what the worker last reported, so a call that
 * cannot succeed never becomes a job. The worker refuses again at dispatch,
 * from the level it recorded the moment the extension set it — which is the
 * check that cannot be stale, since main's record arrives by a POST that can
 * land after the job it should have refused.
 */
export function refuseStorageCall(
  call: RuntimeProxyStorageCall,
  isTrustedContext: boolean,
  accessLevel: RuntimeProxyStorageAccessLevel,
): string | undefined {
  if (isTrustedContext) {
    return undefined;
  }

  if (call.method === "setAccessLevel") {
    return STORAGE_ACCESS_LEVEL_CONTEXT_ERROR;
  }

  return accessLevel === "TRUSTED_CONTEXTS" ? STORAGE_ACCESS_DENIED_ERROR : undefined;
}
