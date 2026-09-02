import { postBridge } from "../facade/lib/bridge";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { getLastErrorMessage } from "../facade/lib/last-error";
import {
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyWorkerStorageAccessLevelRequest,
} from "./bridge-protocol";
import {
  isStorageAccessLevel,
  STORAGE_AREA_NAMES,
  STORAGE_UNAVAILABLE_ERROR,
  type RuntimeProxyStorageAreaName,
  type RuntimeProxyStorageCall,
  type RuntimeProxyStorageResult,
} from "./storage-protocol";

/** Marks a `setAccessLevel` this relay already mirrored, since `chrome` and
 * `browser` can hand back the same area object. */
const MIRRORED_METHOD_MARK = "__meruRuntimeProxyStorageMirror";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Calls one native `chrome.storage` method and reports how it ended, in
 * whichever of Chrome's two forms the runtime answers in.
 *
 * A trailing callback is passed, which every version of the API accepts and
 * which is where `lastError` is readable — the extension's own error text for
 * a quota overrun, a write to `managed`, a malformed key. A runtime that
 * answers with a promise instead, ignoring the callback, is handled too, and a
 * throw on the way in is an error like any other.
 */
function invokeNativeMethod(
  runtime: ChromeNamespace | undefined,
  target: ChromeNamespace,
  method: (...callArguments: unknown[]) => unknown,
  callArguments: unknown[],
): Promise<RuntimeProxyStorageResult> {
  return new Promise((resolve) => {
    let isSettled = false;

    const settle = (result: RuntimeProxyStorageResult) => {
      if (isSettled) {
        return;
      }

      isSettled = true;

      resolve(result);
    };

    try {
      const returned = method.apply(target, [
        ...callArguments,
        (value?: unknown) => {
          const lastError = runtime ? getLastErrorMessage(runtime) : undefined;

          settle(
            lastError === undefined
              ? { status: "ok", value }
              : { status: "error", message: lastError },
          );
        },
      ]);

      if (isThenable(returned)) {
        returned.then(
          (value) => {
            settle({ status: "ok", value });
          },
          (error: unknown) => {
            settle({ status: "error", message: getErrorMessage(error) });
          },
        );
      }
    } catch (error) {
      settle({ status: "error", message: getErrorMessage(error) });
    }
  });
}

/**
 * The worker-side half of the storage proxy, run next to the extension's own
 * service worker in the one session that keeps the real store.
 *
 * It answers the relayed calls of every other session's contexts against that
 * store, and it mirrors `setAccessLevel` so the relay can refuse a content
 * script the same call Chromium would refuse it. Nothing else about
 * `chrome.storage` here is shadowed: the data, the events and the constants
 * are Electron's own, and this session's own extension code reads and writes
 * them without the proxy in the path at all.
 */
export function createStorageRelay(extensionApis: ChromeNamespace[]) {
  const mirroredAreas = new WeakSet<ChromeNamespace>();

  const getArea = (areaName: RuntimeProxyStorageAreaName) => {
    for (const extensionApi of extensionApis) {
      const storage = extensionApi.storage as ChromeNamespace | undefined;

      const area = storage?.[areaName];

      if (typeof area === "object" && area !== null) {
        return { area: area as ChromeNamespace, runtime: extensionApi.runtime as ChromeNamespace };
      }
    }

    return undefined;
  };

  const reportAccessLevel = (request: RuntimeProxyWorkerStorageAccessLevelRequest) =>
    postBridge(RUNTIME_PROXY_PATHS.workerStorageAccessLevel, request).catch(() => undefined);

  /**
   * Wraps `setAccessLevel` alone, on each area the extension's own code will
   * call it on. Chrome has no way to read an access level back, so the only
   * way the relay can hold a content script to the level the extension chose
   * is to watch it being chosen — and only a level the native call accepted is
   * reported, so a refusal changes nothing here either.
   */
  const mirrorAccessLevels = () => {
    for (const extensionApi of extensionApis) {
      const storage = extensionApi.storage as ChromeNamespace | undefined;

      const runtime = extensionApi.runtime as ChromeNamespace | undefined;

      if (!storage) {
        continue;
      }

      for (const areaName of STORAGE_AREA_NAMES) {
        const area = storage[areaName];

        if (typeof area !== "object" || area === null) {
          continue;
        }

        const areaNamespace = area as ChromeNamespace;

        const nativeSetAccessLevel = areaNamespace.setAccessLevel;

        if (
          typeof nativeSetAccessLevel !== "function" ||
          mirroredAreas.has(areaNamespace) ||
          (nativeSetAccessLevel as unknown as ChromeNamespace)[MIRRORED_METHOD_MARK]
        ) {
          continue;
        }

        mirroredAreas.add(areaNamespace);

        const mirrored = (...callArguments: unknown[]) => {
          const callback =
            typeof callArguments.at(-1) === "function"
              ? (callArguments.pop() as (result?: unknown) => void)
              : undefined;

          const requested = (callArguments[0] as { accessLevel?: unknown } | undefined)
            ?.accessLevel;

          const answer = invokeNativeMethod(
            runtime,
            areaNamespace,
            nativeSetAccessLevel as (...args: unknown[]) => unknown,
            callArguments,
          ).then((result) => {
            if (result.status === "ok" && isStorageAccessLevel(requested)) {
              void reportAccessLevel({ area: areaName, accessLevel: requested });
            }

            return result;
          });

          if (callback) {
            void answer.then((result) => {
              if (result.status === "error") {
                console.error("[runtime-proxy-storage] setAccessLevel failed", result.message);
              }

              callback();
            });

            return undefined;
          }

          return answer.then((result) => {
            if (result.status === "error") {
              throw new Error(result.message);
            }

            return undefined;
          });
        };

        Object.defineProperty(mirrored, MIRRORED_METHOD_MARK, {
          value: true,
          enumerable: false,
          configurable: true,
        });

        areaNamespace.setAccessLevel = mirrored;
      }
    }
  };

  /** Answers one relayed call against the worker session's own store. */
  const run = (call: RuntimeProxyStorageCall): Promise<RuntimeProxyStorageResult> => {
    const resolved = getArea(call.area);

    if (!resolved) {
      return Promise.resolve({ status: "error", message: STORAGE_UNAVAILABLE_ERROR });
    }

    const method = resolved.area[call.method];

    if (typeof method !== "function") {
      return Promise.resolve({ status: "error", message: STORAGE_UNAVAILABLE_ERROR });
    }

    return invokeNativeMethod(
      resolved.runtime,
      resolved.area,
      method as (...callArguments: unknown[]) => unknown,
      call.arguments,
    );
  };

  return { mirrorAccessLevels, run };
}
