import type { WebFrameMain } from "electron";
import { EXTENSION_SCHEME_PREFIX } from "./bridge-protocol";
import {
  DEFAULT_STORAGE_ACCESS_LEVELS,
  isStorageAccessLevel,
  isStorageAreaName,
  isStorageMethodName,
  type RuntimeProxyStorageAccessLevel,
  type RuntimeProxyStorageAreaName,
  type RuntimeProxyStorageCall,
  STORAGE_ACCESS_DENIED_ERROR,
  STORAGE_ACCESS_LEVEL_CONTEXT_ERROR,
} from "./storage-protocol";

/**
 * The main-process half of the storage proxy that is worth testing on its own:
 * what a shimmed context is allowed to ask the worker's store, and what the
 * worker has said about who may ask.
 *
 * The relay itself (`runtime-proxy.ts`) carries the call, because a storage
 * call is a job like any other — queued, woken, acked and redelivered on the
 * same machinery `sendMessage` uses.
 */

export function parseStorageCall(value: unknown): RuntimeProxyStorageCall | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const { area, method, arguments: callArguments } = value as Record<string, unknown>;

  if (!isStorageAreaName(area) || !isStorageMethodName(method) || !Array.isArray(callArguments)) {
    return undefined;
  }

  return { area, method, arguments: callArguments };
}

export function parseStorageAccessLevelReport(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const { area, accessLevel } = value as Record<string, unknown>;

  if (!isStorageAreaName(area) || !isStorageAccessLevel(accessLevel)) {
    return undefined;
  }

  return { area, accessLevel };
}

/**
 * Whether the caller is one of the extension's own documents, which Chrome
 * calls a trusted context and never refuses, rather than a content script.
 *
 * Decided from the frame Chromium recorded as the request's caller and from
 * nothing the shim said: a content script can write whatever it likes into its
 * own report, and the whole point of the check is to hold a claim of privilege
 * against something the caller does not control. A frame that is gone by the
 * time the call is handled counts as untrusted, which is the safe direction —
 * it costs a popup that navigated mid-call an error it would not have had
 * natively, and grants nothing.
 *
 * A subframe counts too, and deliberately: 1Password's inline menu is an
 * iframe of the extension inside a web page, and Chrome treats it as the
 * extension page it is.
 */
export function isTrustedStorageCaller(
  extensionId: string,
  senderFrame: WebFrameMain | undefined,
): boolean {
  if (!senderFrame || senderFrame.isDestroyed()) {
    return false;
  }

  const extensionOrigin = `${EXTENSION_SCHEME_PREFIX}${extensionId}`;

  return senderFrame.url === extensionOrigin || senderFrame.url.startsWith(`${extensionOrigin}/`);
}

/**
 * The access levels the extension's worker has set, per extension and area.
 *
 * Held in main rather than only in the worker because the worker restarts: an
 * extension sets its levels as its worker boots, and a content script's call
 * arriving while the worker is starting again would otherwise be answered
 * under Chrome's permissive default, which is the opposite of what the
 * extension asked for. Chromium keeps these in `ExtensionPrefs`, so they
 * survive a browser restart there and only an app quit here — the difference
 * costs the window between a cold launch and the worker's own first call, and
 * closing it would mean persisting state the proxy has no store for.
 */
export class StorageAccessLevels {
  private levels = new Map<string, RuntimeProxyStorageAccessLevel>();

  private key(extensionId: string, area: RuntimeProxyStorageAreaName) {
    return `${extensionId}\0${area}`;
  }

  get(extensionId: string, area: RuntimeProxyStorageAreaName): RuntimeProxyStorageAccessLevel {
    return this.levels.get(this.key(extensionId, area)) ?? DEFAULT_STORAGE_ACCESS_LEVELS[area];
  }

  set(
    extensionId: string,
    area: RuntimeProxyStorageAreaName,
    accessLevel: RuntimeProxyStorageAccessLevel,
  ) {
    this.levels.set(this.key(extensionId, area), accessLevel);
  }

  /** The levels lived in the worker session's store, and go away with it. */
  clear() {
    this.levels.clear();
  }
}

/**
 * The error a storage call meets before it is relayed, or `undefined` when it
 * may go. Both refusals are Chromium's own, and both have to be made here:
 * the call is answered in the worker, which is a privileged context Chromium
 * would let do either.
 */
export function refuseStorageCall({
  call,
  extensionId,
  isTrustedContext,
  accessLevels,
}: {
  call: RuntimeProxyStorageCall;
  extensionId: string;
  isTrustedContext: boolean;
  accessLevels: StorageAccessLevels;
}): string | undefined {
  if (isTrustedContext) {
    return undefined;
  }

  if (call.method === "setAccessLevel") {
    return STORAGE_ACCESS_LEVEL_CONTEXT_ERROR;
  }

  return accessLevels.get(extensionId, call.area) === "TRUSTED_CONTEXTS"
    ? STORAGE_ACCESS_DENIED_ERROR
    : undefined;
}
