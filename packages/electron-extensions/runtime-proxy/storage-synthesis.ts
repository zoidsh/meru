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

const READ_METHOD_NAMES = ["get", "getKeys", "getBytesInUse"] as const;

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

  const result = run(callback ? callArguments.slice(0, -1) : callArguments);

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
 * native events fire there but whose write the worker never hears.
 *
 * Writes to one area run one at a time, or two overlapping ones would each read
 * the other's state as their own before and report a change that never
 * happened. Reads wait behind the writes already queued and not behind each
 * other, which keeps the order Chromium answers calls in: a `get` made after a
 * `set` sees what the `set` wrote, even unawaited.
 *
 * Opted into per extension, since it puts two extra reads on every write.
 */
export function installStorageSynthesis(extensionApis: ChromeNamespace[]) {
  const changedEvents = createStorageChangedEvents(LOG_LABEL);

  const shadowedAreas = new WeakSet<ChromeNamespace>();

  /** The last write queued on each area, which never rejects. */
  const writeQueues = new Map<RuntimeProxyStorageAreaName, Promise<unknown>>();

  const getWriteQueue = (areaName: RuntimeProxyStorageAreaName) =>
    writeQueues.get(areaName) ?? Promise.resolve();

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

    const write = async (
      method: WriteMethodName,
      nativeWrite: NativeMethod,
      callArguments: unknown[],
    ) => {
      const keys = getAffectedKeys(method, callArguments);

      const before = keys?.length === 0 ? undefined : await readKeys(keys);

      const written = await invokeNativeMethod(runtime, area, nativeWrite, callArguments);

      if (written.status === "error" || before?.status !== "ok") {
        return written;
      }

      const after = await readKeys(keys);

      if (after.status === "ok" && isStorageItems(before.value) && isStorageItems(after.value)) {
        const changes = diffStorageItems(before.value, after.value);

        if (Object.keys(changes).length > 0) {
          changedEvents.dispatch(areaName, changes);
        }
      }

      return written;
    };

    for (const method of WRITE_METHOD_NAMES) {
      const nativeWrite = area[method];

      if (typeof nativeWrite !== "function") {
        continue;
      }

      area[method] = (...callArguments: unknown[]) =>
        answerCall(runtime, callArguments, (forwardedArguments) => {
          const written = getWriteQueue(areaName).then(() =>
            write(method, nativeWrite as NativeMethod, forwardedArguments),
          );

          writeQueues.set(
            areaName,
            written.catch(() => undefined),
          );

          return written;
        });
    }

    for (const method of READ_METHOD_NAMES) {
      const nativeRead = area[method];

      if (typeof nativeRead !== "function") {
        continue;
      }

      area[method] = (...callArguments: unknown[]) =>
        answerCall(runtime, callArguments, (forwardedArguments) =>
          getWriteQueue(areaName).then(() =>
            invokeNativeMethod(runtime, area, nativeRead as NativeMethod, forwardedArguments),
          ),
        );
    }
  };

  for (const extensionApi of extensionApis) {
    const storage = extensionApi.storage as ChromeNamespace | undefined;

    if (!storage) {
      continue;
    }

    changedEvents.shadow(storage);

    for (const areaName of STORAGE_AREA_NAMES) {
      const area = storage[areaName];

      if (typeof area !== "object" || area === null || shadowedAreas.has(area as ChromeNamespace)) {
        continue;
      }

      shadowedAreas.add(area as ChromeNamespace);

      shadowArea(areaName, area as ChromeNamespace, extensionApi.runtime as ChromeNamespace);
    }
  }
}
