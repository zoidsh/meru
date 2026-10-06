import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import {
  STORAGE_AREA_NAMES,
  type RuntimeProxyStorageAreaName,
  type RuntimeProxyStorageChanges,
} from "./storage-protocol";

/** Marks an `onChanged` whose listeners the proxy has taken over. */
const SHADOWED_EVENT_MARK = "__meruRuntimeProxyStorageChangedShim";

/**
 * The listeners a context registered on `chrome.storage`'s change events, kept
 * here because the native events never fire with the changes the context is
 * owed: in a shimmed session they watch a store nothing writes any more, and in
 * the worker Electron dispatches none of them.
 */
type StorageChangedListeners = {
  /** On `chrome.storage.onChanged`, which is told the area's name as well. */
  everyArea: Set<ChromeEventListener>;
  /** On `chrome.storage.<area>.onChanged`, which is not. */
  byArea: Map<RuntimeProxyStorageAreaName, Set<ChromeEventListener>>;
};

/**
 * Takes over one `onChanged`, in place on Chrome's own event object rather
 * than by replacing it: whatever else Chromium put there stays, and an
 * extension holding a reference to the event from before the proxy ran holds
 * the same object afterwards.
 *
 * Nothing is registered natively, which is the one place this differs from how
 * `runtime.onMessage` is mirrored (`message-dispatch.ts`). There, native
 * dispatch is still real — the worker's own session messages itself. Here it
 * can only be wrong. In a shimmed session the native event watches a store
 * that is not the extension's any more, so it could report a change of the
 * wrong store and never one of the right one; in the worker it is silent, and
 * the day Electron starts delivering it a native registration would hear every
 * change twice.
 */
function shadowChangedEvent(event: ChromeNamespace, listeners: Set<ChromeEventListener>) {
  if (event[SHADOWED_EVENT_MARK]) {
    return;
  }

  event.addListener = (listener: ChromeEventListener) => {
    listeners.add(listener);
  };

  event.removeListener = (listener: ChromeEventListener) => {
    listeners.delete(listener);
  };

  event.hasListener = (listener: ChromeEventListener) => listeners.has(listener);

  event.hasListeners = () => listeners.size > 0;

  try {
    Object.defineProperty(event, SHADOWED_EVENT_MARK, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // A mark Chromium will not let us set costs nothing but the guard above
  }
}

/**
 * A copy per event, the way Chromium hands each one its own `changes.Clone()`.
 * Without it a listener on the area event that mutates or deletes a key would
 * change what the `chrome.storage.onChanged` listeners then see. A structured
 * clone is exactly right for the shape: the values came out of storage, which
 * holds JSON, so nothing in here is unclonable.
 */
function cloneChanges(changes: RuntimeProxyStorageChanges): RuntimeProxyStorageChanges {
  try {
    return structuredClone(changes);
  } catch {
    // A value a clone chokes on is not worth the whole event
    return changes;
  }
}

function emitChange(
  listeners: Set<ChromeEventListener>,
  callArguments: unknown[],
  logLabel: string,
) {
  for (const listener of listeners) {
    try {
      listener(...callArguments);
    } catch (error) {
      console.error(`[${logLabel}] a storage.onChanged listener threw`, error);
    }
  }
}

/**
 * `chrome.storage`'s change events, fed by the proxy rather than by Chromium.
 * Every extension API object `shadow` is called for shares one set of
 * listeners, so an extension writing through one and listening on another
 * still hears itself, as it would natively.
 */
export function createStorageChangedEvents(logLabel: string) {
  const listeners: StorageChangedListeners = {
    everyArea: new Set(),
    byArea: new Map(STORAGE_AREA_NAMES.map((areaName) => [areaName, new Set()])),
  };

  return {
    /** Takes over the top-level event and each area's own, where they exist. */
    shadow(storage: ChromeNamespace) {
      const changedEvent = storage.onChanged as ChromeNamespace | undefined;

      if (changedEvent) {
        shadowChangedEvent(changedEvent, listeners.everyArea);
      }

      for (const areaName of STORAGE_AREA_NAMES) {
        const areaChangedEvent = (storage[areaName] as ChromeNamespace | undefined)?.onChanged as
          | ChromeNamespace
          | undefined;

        const areaListeners = listeners.byArea.get(areaName);

        if (areaChangedEvent && areaListeners) {
          shadowChangedEvent(areaChangedEvent, areaListeners);
        }
      }
    },

    /**
     * One change, dispatched the way Chrome dispatches its own: to the area's
     * own event, which hears the changes alone, and to
     * `chrome.storage.onChanged`, which is told the area's name as well. A
     * listener that throws does not cost the others theirs.
     */
    dispatch(area: RuntimeProxyStorageAreaName, changes: RuntimeProxyStorageChanges) {
      const areaListeners = listeners.byArea.get(area);

      if (areaListeners) {
        emitChange(areaListeners, [cloneChanges(changes)], `${logLabel}:${area}`);
      }

      emitChange(listeners.everyArea, [cloneChanges(changes), area], logLabel);
    },
  };
}
