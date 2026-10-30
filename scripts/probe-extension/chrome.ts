/**
 * What every context of the probe extension shares: a hand-typed slice of
 * `chrome`, the inventory, and the one way a context reports back to the
 * driver, a POST to the server it runs.
 *
 * Typed by hand because the repository carries no `@types/chrome`, and reached
 * through `globalThis` so that no `chrome` global leaks into the root project's
 * types.
 */

import {
  type Context,
  type Inventory,
  MEMBERS,
  NAMESPACES,
  type RegisteredContentScript,
  type Settled,
} from "./protocol";

// Replaced at build time by `probe-extension-api.ts`
declare const __PROBE_ORIGIN__: string;
declare const __PROBE_LAUNCH__: number;

export const PROBE_ORIGIN = __PROBE_ORIGIN__;

/** Which launch of the browser this build of the extension is for, from 1. */
export const PROBE_LAUNCH = __PROBE_LAUNCH__;

export type ProbeEvent<Listener> = {
  addListener: (listener: Listener, ...options: unknown[]) => void;
};

type StorageArea = {
  get: (keys: string) => Promise<unknown>;
  set: (items: Record<string, unknown>) => Promise<void>;
  onChanged?: ProbeEvent<(changes: Record<string, unknown>) => void>;
};

export type ProbeAlarm = { name: string; scheduledTime: number };

export type WebRequestDetails = { url: string; type: string; tabId: number };

export type ProbeChrome = {
  alarms?: {
    create: (name: string, info: { delayInMinutes: number }) => Promise<void>;
    get: (name: string) => Promise<ProbeAlarm | undefined>;
    onAlarm: ProbeEvent<(alarm: ProbeAlarm) => void>;
  };
  runtime: {
    onInstalled?: ProbeEvent<(details: { reason: string }) => void>;
    onMessage: ProbeEvent<
      (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean
    >;
    sendMessage: (message: unknown) => Promise<unknown>;
  };
  scripting?: {
    getRegisteredContentScripts: () => Promise<RegisteredContentScript[]>;
    registerContentScripts: (
      scripts: (RegisteredContentScript & { js: string[]; matches: string[]; runAt: string })[],
    ) => Promise<void>;
  };
  storage?: {
    local?: StorageArea;
    onChanged?: ProbeEvent<(changes: Record<string, unknown>, areaName: string) => void>;
  };
  webRequest?: {
    onBeforeRequest?: ProbeEvent<(details: WebRequestDetails) => void>;
    onCompleted?: ProbeEvent<(details: WebRequestDetails) => void>;
  };
};

export const probeChrome = (globalThis as unknown as { chrome: ProbeChrome }).chrome;

function typeOfPath(dottedPath: string) {
  let value: unknown = probeChrome;

  try {
    for (const key of dottedPath.split(".")) {
      if (value === undefined || value === null) {
        return "undefined";
      }

      value = (value as Record<string, unknown>)[key];
    }

    return typeof value;
  } catch {
    return "throws";
  }
}

/**
 * Calls the member at a dotted path below `chrome` on the object that holds
 * it, since Chromium's bindings refuse a detached call, and settles whatever it
 * returns or throws.
 */
export async function callMember(dottedPath: string, args: unknown[]): Promise<Settled<unknown>> {
  try {
    const keys = dottedPath.split(".");
    const name = keys.pop() ?? "";
    let holder: unknown = probeChrome;

    for (const key of keys) {
      holder = (holder as Record<string, unknown> | undefined)?.[key];
    }

    const member = (holder as Record<string, unknown> | undefined)?.[name];

    if (typeof member !== "function") {
      return { error: `not a function: ${typeof member}` };
    }

    return { value: await (member as (...callArgs: unknown[]) => unknown).apply(holder, args) };
  } catch (error) {
    return { error: String(error) };
  }
}

export function takeInventory(): Inventory {
  return Object.fromEntries(
    [...NAMESPACES, ...MEMBERS].map((dottedPath) => [dottedPath, typeOfPath(dottedPath)]),
  );
}

export function report(route: string, body: unknown) {
  // A plain-text body keeps the request simple, so a page-origin context sends
  // no preflight
  return fetch(`${PROBE_ORIGIN}${route}`, { method: "POST", body: JSON.stringify(body) }).catch(
    () => undefined,
  );
}

export function reportEvent(context: Context, name: string, detail?: unknown) {
  return report("/event", { context, name, detail });
}

/** Adds a listener that reports each firing, or reports why it could not. */
export function listen<Args extends unknown[]>(
  context: Context,
  name: string,
  event: ProbeEvent<(...args: Args) => void> | undefined,
  describe: (...args: Args) => unknown,
  ...options: unknown[]
) {
  if (typeof event?.addListener !== "function") {
    void reportEvent(context, `${name}:unavailable`, typeof event);

    return;
  }

  event.addListener(
    (...args: Args) => {
      void reportEvent(context, name, describe(...args));
    },
    ...options,
  );
}
