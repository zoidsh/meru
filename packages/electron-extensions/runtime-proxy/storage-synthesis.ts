import type { ChromeNamespace } from "../facade/lib/chrome";
import { withLastError } from "../facade/lib/last-error";
import { invokeNativeMethod, type NativeMethod } from "./native-storage-call";
import { createStorageChangedEvents } from "./storage-events";
import {
  STORAGE_AREA_NAMES,
  type RuntimeProxyStorageAreaName,
  type RuntimeProxyStorageChanges,
  type RuntimeProxyStorageResult,
} from "./storage-protocol";

const LOG_LABEL = "runtime-proxy-storage-synthesis";

const WRITE_METHOD_NAMES = ["set", "remove", "clear"] as const;

type WriteMethodName = (typeof WRITE_METHOD_NAMES)[number];

type StorageItems = Record<string, unknown>;

/**
 * The keys a write can change, as `get` takes them, or `null` for every key.
 * Only string keys: anything else is a malformed call the native write is
 * left to refuse, and passing it to `get` first would fail the read instead.
 */
export function getAffectedKeys(
  method: WriteMethodName,
  callArguments: unknown[],
): string[] | null {
  if (method === "clear") {
    return null;
  }

  const [items] = callArguments;

  if (method === "set") {
    return typeof items === "object" && items !== null && !Array.isArray(items)
      ? Object.keys(items)
      : [];
  }

  if (typeof items === "string") {
    return [items];
  }

  return Array.isArray(items) ? items.filter((key): key is string => typeof key === "string") : [];
}

function isStorageItems(value: unknown): value is StorageItems {
  return typeof value === "object" && value !== null;
}

/**
 * What changed between two reads of the same keys, in `onChanged`'s shape: an
 * added key has no `oldValue`, a removed one no `newValue`.
 *
 * A key written with the value it already had is no change. Chromium's value
 * store makes the same comparison and reports nothing, which is what keeps an
 * extension re-saving its own state on a timer from waking every listener it
 * has. Comparing serialized values is exact here: both sides were read back
 * out of storage, which holds JSON and returns object keys in one order.
 */
export function diffStorageItems(before: StorageItems, after: StorageItems) {
  const changes: RuntimeProxyStorageChanges = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const oldValue = before[key];

    const newValue = after[key];

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

/**
 * Answers a shadowed call in whichever form it was made: a trailing callback
 * gets the value, with `lastError` set for its duration on a failure, and
 * otherwise the promise resolves with the value or rejects.
 */
function answerCall(
  runtime: ChromeNamespace | undefined,
  callArguments: unknown[],
  run: (forwardedArguments: unknown[]) => Promise<RuntimeProxyStorageResult>,
) {
  const callback =
    typeof callArguments.at(-1) === "function"
      ? (callArguments.at(-1) as (value?: unknown) => void)
      : undefined;

  const forwardedArguments = callback ? callArguments.slice(0, -1) : [...callArguments];

  // Chrome takes a trailing `undefined` or `null` for an omitted optional
  // argument, but only in last place: forwarded ahead of the callback the
  // native call is given, it fails Chromium's signature matching instead
  while (forwardedArguments.length > 0 && forwardedArguments.at(-1) == null) {
    forwardedArguments.pop();
  }

  const result = run(forwardedArguments);

  if (!callback) {
    return result.then((settled) => {
      if (settled.status === "error") {
        throw new Error(settled.message);
      }

      return settled.value;
    });
  }

  void result.then((settled) => {
    if (settled.status === "ok") {
      callback(settled.value);

      return;
    }

    withLastError(runtime ?? {}, settled.message, () => {
      callback();
    });
  });

  return undefined;
}

/**
 * Synthesizes `chrome.storage.onChanged` in the extension's service worker,
 * where Electron dispatches no `EventRouter` event of any kind (see
 * `watchChanges` in `storage-relay.ts`). An extension whose state lives behind
 * that event otherwise never hears its own writes: Bitwarden's worker goes on
 * logging `Null or undefined account` after a sign-in has stored one.
 *
 * Each area's `set`, `remove` and `clear` are shadowed to read the keys they
 * touch, write, read them again, and dispatch the difference to the change
 * events, which are taken over the way the shim takes them over. That covers
 * every write the store gets through this worker's `chrome.storage`, and so
 * every write from a shimmed session too, since the relay answers those against
 * the same area objects. What it cannot see is a write with no call here
 * behind it: one made by an extension page in the worker's own session, whose
 * native events fire there and which the page reports for `dispatchReported` to carry
 * the rest of the way (`page-storage-writes.ts`).
 *
 * The read before, the write and the read after are issued back to back, in
 * the call itself, and that is what keeps them correct. Chromium runs an
 * extension's storage calls in the order they arrive, so no other call can
 * land between them, two overlapping writes each read their own before, and a
 * `get` made after an unawaited `set` sees what it wrote. Holding the write
 * back until the read before had answered would break the ordering another
 * context relies on: a worker that writes and then messages a page could have
 * the page read the store before the write had reached it.
 *
 * Opted into per extension, since it puts two extra reads on every write.
 */
export function installStorageSynthesis(extensionApis: ChromeNamespace[]) {
  const changedEvents = createStorageChangedEvents(LOG_LABEL);

  for (const extensionApi of extensionApis) {
    const storage = extensionApi.storage as ChromeNamespace | undefined;

    if (storage) {
      changedEvents.shadow(storage);
    }
  }

  return shadowStorageWrites(extensionApis, changedEvents.dispatch);
}

/**
 * Shadows each area's `set`, `remove` and `clear` to read the keys they touch,
 * write, read them again, and hand the difference to `onChanges`. The worker's
 * synthesis dispatches it; an extension page in the worker's session reports
 * it to the worker instead, its own native events being the ones that work.
 */
export function shadowStorageWrites(
  extensionApis: ChromeNamespace[],
  onChanges: (area: RuntimeProxyStorageAreaName, changes: RuntimeProxyStorageChanges) => void,
) {
  const shadowedAreas = new WeakSet<ChromeNamespace>();

  /**
   * The last dispatch on each area, which never rejects. Chromium answers in
   * order anyway; the chain is what makes the events' order not depend on it.
   */
  const dispatchChains = new Map<RuntimeProxyStorageAreaName, Promise<unknown>>();

  const areaReaders = new Map<
    RuntimeProxyStorageAreaName,
    (keys: string[] | null) => Promise<RuntimeProxyStorageResult>
  >();

  const chainDispatch = <T>(areaName: RuntimeProxyStorageAreaName, run: () => Promise<T>) => {
    const dispatched = (dispatchChains.get(areaName) ?? Promise.resolve()).then(run);

    dispatchChains.set(
      areaName,
      dispatched.catch(() => undefined),
    );

    return dispatched;
  };

  const shadowArea = (
    areaName: RuntimeProxyStorageAreaName,
    area: ChromeNamespace,
    runtime: ChromeNamespace | undefined,
  ) => {
    const nativeGet = area.get;

    if (typeof nativeGet !== "function") {
      return;
    }

    const readKeys = (keys: string[] | null) =>
      invokeNativeMethod(runtime, area, nativeGet as NativeMethod, [keys]);

    if (!areaReaders.has(areaName)) {
      areaReaders.set(areaName, readKeys);
    }

    const write = (
      method: WriteMethodName,
      nativeWrite: NativeMethod,
      callArguments: unknown[],
    ) => {
      const keys = getAffectedKeys(method, callArguments);

      const touchesNothing = keys?.length === 0;

      const before = touchesNothing ? undefined : readKeys(keys);

      const written = invokeNativeMethod(runtime, area, nativeWrite, callArguments);

      const after = touchesNothing ? undefined : readKeys(keys);

      return chainDispatch(areaName, async () => {
        const [beforeResult, writtenResult, afterResult] = await Promise.all([
          before,
          written,
          after,
        ]);

        if (
          writtenResult.status === "ok" &&
          beforeResult?.status === "ok" &&
          afterResult?.status === "ok" &&
          isStorageItems(beforeResult.value) &&
          isStorageItems(afterResult.value)
        ) {
          const changes = diffStorageItems(beforeResult.value, afterResult.value);

          if (Object.keys(changes).length > 0) {
            onChanges(areaName, changes);
          }
        }

        return writtenResult;
      });
    };

    for (const method of WRITE_METHOD_NAMES) {
      const nativeWrite = area[method];

      if (typeof nativeWrite !== "function") {
        continue;
      }

      area[method] = (...callArguments: unknown[]) =>
        answerCall(runtime, callArguments, (forwardedArguments) =>
          write(method, nativeWrite as NativeMethod, forwardedArguments),
        );
    }
  };

  for (const extensionApi of extensionApis) {
    const storage = extensionApi.storage as ChromeNamespace | undefined;

    if (!storage) {
      continue;
    }

    for (const areaName of STORAGE_AREA_NAMES) {
      const area = storage[areaName];

      if (typeof area !== "object" || area === null || shadowedAreas.has(area as ChromeNamespace)) {
        continue;
      }

      shadowedAreas.add(area as ChromeNamespace);

      shadowArea(areaName, area as ChromeNamespace, extensionApi.runtime as ChromeNamespace);
    }
  }

  return {
    /**
     * A change made somewhere the shadowed writes cannot see, handed to
     * `onChanges` in its place among theirs (`page-storage-writes.ts`).
     *
     * The report travels through main, so it can arrive after a write made
     * here later than the one it describes, and dispatched as it came it would
     * leave the listeners on the older value. Only Chromium knows where the
     * report's write fell among this store's writes, so the keys are read
     * again, issued now so the read lands after every write issued before it,
     * and a key whose value has moved on since is dropped: whichever write
     * moved it is dispatched by this chain or by a later report.
     */
    dispatchReported(areaName: RuntimeProxyStorageAreaName, changes: RuntimeProxyStorageChanges) {
      const readKeys = areaReaders.get(areaName);

      const keys = Object.keys(changes);

      if (!readKeys || keys.length === 0) {
        return Promise.resolve();
      }

      const current = readKeys(keys);

      return chainDispatch(areaName, async () => {
        const currentResult = await current;

        if (currentResult.status !== "ok" || !isStorageItems(currentResult.value)) {
          return;
        }

        const currentItems = currentResult.value;

        const currentChanges = Object.fromEntries(
          Object.entries(changes).filter(
            ([key, change]) =>
              JSON.stringify(currentItems[key]) === JSON.stringify(change.newValue),
          ),
        );

        if (Object.keys(currentChanges).length > 0) {
          onChanges(areaName, currentChanges);
        }
      });
    },
  };
}
