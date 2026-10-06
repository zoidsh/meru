import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import {
  type RuntimeProxyStorageAreaName,
  type RuntimeProxyStorageChanges,
  STORAGE_AREA_NAMES,
} from "./storage-protocol";

/**
 * SPIKE: synthesizes `chrome.storage.onChanged` in the worker from the writes
 * that pass through `chrome.storage` itself.
 *
 * Electron dispatches no `EventRouter` event into an extension service worker —
 * measured again on 43.7.7 with Chromium 150 — so the store changes and nothing
 * is told. An extension whose long-lived state is an observable fed by
 * `onChanged` therefore never sees its own writes: Bitwarden's active account
 * stays null through a successful sign-in, and its worker logs
 * `Error: Null or undefined account` while the store already holds the account.
 *
 * So `set`, `remove` and `clear` are shadowed on each area, the affected keys
 * are read before the write, and the difference is dispatched to the listeners
 * this module holds — which means `onChanged.addListener` is shadowed too,
 * since Chromium's own event object cannot be dispatched into from here.
 *
 * What it covers is every write through the API, in the worker's session and in
 * every shimmed one, since a relayed call runs against these same area objects.
 * What it cannot cover is a change with no call behind it: a store written by
 * another process, or Chromium's own eviction. No curated extension has one.
 *
 * The read-before-write serializes per area, because two overlapping writes
 * would otherwise each read the other's pre-state and report a change that
 * never happened.
 */

type StorageItems = Record<string, unknown>;

const WRITE_METHODS = ["set", "remove", "clear"] as const;

type WriteMethod = (typeof WRITE_METHODS)[number];

function toKeys(areaArguments: unknown[], method: WriteMethod): string[] | "all" {
  if (method === "clear") {
    return "all";
  }

  const first = areaArguments[0];

  if (method === "set") {
    return typeof first === "object" && first !== null ? Object.keys(first) : [];
  }

  if (typeof first === "string") {
    return [first];
  }

  return Array.isArray(first) ? first.filter((key): key is string => typeof key === "string") : [];
}

function diff(before: StorageItems, after: StorageItems): RuntimeProxyStorageChanges {
  const changes: RuntimeProxyStorageChanges = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const oldValue = before[key];

    const newValue = after[key];

    // Chrome compares by value and reports nothing for a write that changed
    // nothing, which is what keeps an extension re-writing its own state on a
    // timer from waking every listener it has
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      continue;
    }

    changes[key] = {
      ...(oldValue === undefined ? {} : { oldValue }),
      ...(newValue === undefined ? {} : { newValue }),
    };
  }

  return changes;
}

export type StorageSynthesisOptions = {
  /** Reports a synthesized change so main can fan it out to the shimmed contexts. */
  reportChange: (area: RuntimeProxyStorageAreaName, changes: RuntimeProxyStorageChanges) => void;
};

export function installStorageSynthesis(
  extensionApis: ChromeNamespace[],
  { reportChange }: StorageSynthesisOptions,
) {
  const shadowed = new WeakSet<ChromeNamespace>();

  /** The listeners this module dispatches to, per event object it shadowed. */
  const areaListeners = new Map<RuntimeProxyStorageAreaName, Set<ChromeEventListener>>();

  const globalListeners = new Set<ChromeEventListener>();

  /** One write at a time per area, so a read-before-write cannot interleave. */
  const areaQueues = new Map<RuntimeProxyStorageAreaName, Promise<unknown>>();

  const dispatch = (areaName: RuntimeProxyStorageAreaName, changes: RuntimeProxyStorageChanges) => {
    if (Object.keys(changes).length === 0) {
      return;
    }

    for (const listener of areaListeners.get(areaName) ?? []) {
      try {
        listener(changes);
      } catch (error) {
        console.error("[Meru] A storage.onChanged listener threw", error);
      }
    }

    for (const listener of globalListeners) {
      try {
        listener(changes, areaName);
      } catch (error) {
        console.error("[Meru] A storage.onChanged listener threw", error);
      }
    }

    reportChange(areaName, changes);
  };

  const shadowEvent = (event: ChromeNamespace, listeners: Set<ChromeEventListener>) => {
    if (shadowed.has(event)) {
      return;
    }

    shadowed.add(event);

    const nativeAddListener = event.addListener as
      | ((this: ChromeNamespace, listener: ChromeEventListener) => void)
      | undefined;

    event.addListener = (listener: ChromeEventListener) => {
      listeners.add(listener);

      // Still registered natively, so the day Electron delivers the event the
      // extension hears it from Chromium as well — a double delivery, which is
      // when this whole module comes out
      nativeAddListener?.call(event, listener);
    };

    event.removeListener = (listener: ChromeEventListener) => {
      listeners.delete(listener);
    };

    event.hasListener = (listener: ChromeEventListener) => listeners.has(listener);

    event.hasListeners = () => listeners.size > 0;
  };

  for (const extensionApi of extensionApis) {
    const storage = extensionApi.storage as ChromeNamespace | undefined;

    if (!storage) {
      continue;
    }

    const globalEvent = storage.onChanged as ChromeNamespace | undefined;

    if (globalEvent && typeof globalEvent.addListener === "function") {
      shadowEvent(globalEvent, globalListeners);
    }

    for (const areaName of STORAGE_AREA_NAMES) {
      const area = storage[areaName] as ChromeNamespace | undefined;

      if (!area || shadowed.has(area)) {
        continue;
      }

      shadowed.add(area);

      let listeners = areaListeners.get(areaName);

      if (!listeners) {
        listeners = new Set();

        areaListeners.set(areaName, listeners);
      }

      const areaEvent = area.onChanged as ChromeNamespace | undefined;

      if (areaEvent && typeof areaEvent.addListener === "function") {
        shadowEvent(areaEvent, listeners);
      }

      const nativeGet = area.get as
        | ((this: ChromeNamespace, keys: unknown) => Promise<StorageItems>)
        | undefined;

      if (typeof nativeGet !== "function") {
        continue;
      }

      for (const method of WRITE_METHODS) {
        const nativeWrite = area[method] as
          | ((this: ChromeNamespace, ...writeArguments: unknown[]) => Promise<void>)
          | undefined;

        if (typeof nativeWrite !== "function") {
          continue;
        }

        area[method] = (...writeArguments: unknown[]) => {
          const callback = writeArguments.at(-1);

          const hasCallback = typeof callback === "function";

          const forwarded = hasCallback ? writeArguments.slice(0, -1) : writeArguments;

          const keys = toKeys(forwarded, method);

          const queued = (areaQueues.get(areaName) ?? Promise.resolve()).then(async () => {
            const before = await nativeGet.call(area, keys === "all" ? null : keys);

            await nativeWrite.call(area, ...forwarded);

            const after = await nativeGet.call(area, keys === "all" ? null : keys);

            dispatch(areaName, diff(before, after));
          });

          areaQueues.set(
            areaName,
            queued.catch(() => undefined),
          );

          if (!hasCallback) {
            return queued;
          }

          queued.then(
            () => {
              (callback as () => void)();
            },
            () => {
              (callback as () => void)();
            },
          );

          return undefined;
        };
      }
    }
  }
}
