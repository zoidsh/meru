import { postBridge } from "../facade/lib/bridge";
import type { ChromeEventListener, ChromeNamespace } from "../facade/lib/chrome";
import { getLastErrorMessage, withLastError } from "../facade/lib/last-error";
import {
  RUNTIME_PROXY_PATHS,
  type RuntimeProxyWorkerStorageAccessLevelRequest,
  type RuntimeProxyWorkerStorageChangedRequest,
} from "./bridge-protocol";
import {
  DEFAULT_STORAGE_ACCESS_LEVELS,
  isStorageAccessLevel,
  isStorageAreaName,
  refuseStorageCall,
  STORAGE_AREA_NAMES,
  STORAGE_UNAVAILABLE_ERROR,
  type RuntimeProxyStorageAccessLevel,
  type RuntimeProxyStorageAreaName,
  type RuntimeProxyStorageCall,
  type RuntimeProxyStorageChanges,
  type RuntimeProxyStorageResult,
} from "./storage-protocol";

/** Marks a `setAccessLevel` this relay already mirrored, since `chrome` and
 * `browser` can hand back the same area object. */
const MIRRORED_METHOD_MARK = "__meruRuntimeProxyStorageMirror";

type NativeMethod = (...callArguments: unknown[]) => unknown;

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
 * store, it mirrors `setAccessLevel` so the relay can refuse a content script
 * the same call Chromium would refuse it, and it listens to the store's own
 * `onChanged` so main can fan every change out to the sessions that have no
 * store of their own to hear it from. Nothing else about `chrome.storage` here
 * is shadowed: the data, the events and the constants are Electron's own, the
 * listener is an ordinary one alongside the extension's, and this session's own
 * extension code reads and writes without the proxy in the path at all.
 */
export function createStorageRelay(extensionApis: ChromeNamespace[]) {
  const mirroredAreas = new WeakSet<ChromeNamespace>();

  /**
   * The `setAccessLevel` each area had before it was mirrored. A relayed call
   * goes to this rather than through the wrapper: the wrapper exists to notice
   * the extension's own calls, and routing a relayed one through it would put
   * the caller's answer behind the wrapper's reporting and hide `lastError`
   * from the code that reads it.
   */
  const nativeSetAccessLevels = new Map<RuntimeProxyStorageAreaName, NativeMethod>();

  /**
   * The level each area is at, recorded here as well as reported to main.
   * This copy is what a relayed call is held against, because it is written
   * the moment the native call returns while main's is written by a POST that
   * can land after the job it should have refused.
   */
  const accessLevels = new Map<RuntimeProxyStorageAreaName, RuntimeProxyStorageAccessLevel>();

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

  const reportChange = (request: RuntimeProxyWorkerStorageChangedRequest) =>
    postBridge(RUNTIME_PROXY_PATHS.workerStorageChanged, request).catch(() => undefined);

  /**
   * Reports every change to this session's store — the one store the shared
   * instance keeps — so main can fan it out to the shimmed contexts, whose own
   * `chrome.storage.onChanged` has nothing left to fire about now that nothing
   * writes their session's store.
   *
   * One listener, and on the top-level `chrome.storage.onChanged`: it names the
   * area itself, where the four per-area events would take four listeners to
   * hear the same changes. And on one global only — Electron builds `chrome`
   * and `browser` separately, both dispatch every change, and a listener on
   * each would report all of them twice.
   *
   * The level the change is stamped with is this relay's own record rather than
   * main's, taken the moment the change fired: main's is written by a POST that
   * can land after this one, and a change may not outrun the level that decides
   * who hears it.
   *
   * **This never fires on Electron 43.2.0**, so the fan-out below it has
   * carriage and no source. Measured 2 September 2026 on a bare Electron with
   * none of Meru in it: a do-nothing MV3 extension whose worker registers
   * `chrome.storage.onChanged` and `chrome.storage.local.onChanged` at top
   * level, before any write, sees neither ever fire, though both are present as
   * functions and its own writes succeed. It is not storage's own router
   * either — `alarms.onAlarm` on a six-second alarm and `runtime.onInstalled`
   * on a fresh profile are just as silent, so Electron dispatches no
   * `EventRouter` events into an extension service worker. `runtime.onMessage`
   * does still arrive, being messaging rather than an event dispatch, which is
   * what the rest of this relay runs on. The events fire correctly in
   * extension *pages* too.
   *
   * The listener stays because it is the right code against Chrome's contract,
   * it costs nothing while silent, and it starts working the day Electron
   * delivers the event with no change here. See the feature doc for what is
   * deferred behind it.
   */
  const watchChanges = () => {
    for (const extensionApi of extensionApis) {
      const storage = extensionApi.storage as ChromeNamespace | undefined;

      const onChanged = storage?.onChanged as ChromeNamespace | undefined;

      if (typeof onChanged?.addListener !== "function") {
        continue;
      }

      // Called on the event rather than through a reference of its own:
      // Chromium's event bindings need their receiver, and a detached
      // `addListener` throws — which, here, would take the whole relay entry
      // down with it and the worker's own script after it
      const addListener = onChanged.addListener as (
        this: ChromeNamespace,
        listener: ChromeEventListener,
      ) => void;

      addListener.call(onChanged, (changes: unknown, areaName: unknown) => {
        if (!isStorageAreaName(areaName) || typeof changes !== "object" || changes === null) {
          return;
        }

        void reportChange({
          area: areaName,
          changes: changes as RuntimeProxyStorageChanges,
          accessLevel: accessLevels.get(areaName) ?? DEFAULT_STORAGE_ACCESS_LEVELS[areaName],
        });
      });

      return;
    }
  };

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

        nativeSetAccessLevels.set(areaName, nativeSetAccessLevel as NativeMethod);

        const mirrored = (...callArguments: unknown[]) => {
          const callback =
            typeof callArguments.at(-1) === "function"
              ? (callArguments.pop() as (result?: unknown) => void)
              : undefined;

          const answer = setAccessLevel(areaName, areaNamespace, runtime, callArguments);

          if (callback) {
            /*
             * The extension's own code reads `chrome.runtime.lastError` inside
             * this callback, and this wrapper is the one thing the proxy puts
             * in front of the worker's native storage — so the failure it saw
             * has to be there, exactly as the native call would have left it.
             */
            void answer.then((result) => {
              if (result.status === "ok") {
                callback();

                return;
              }

              withLastError(runtime ?? {}, result.message, () => {
                callback();
              });
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

  /**
   * Sets an area's access level natively and reports the level it accepted,
   * for the extension's own call and for a relayed one alike.
   *
   * The report is awaited rather than left in flight, so the caller's answer
   * cannot land in main ahead of it: `setAccessLevel` is synchronous in
   * Chromium's browser process, so an extension page that awaits it and then
   * has a content script read is entitled to the new level being in force.
   */
  const setAccessLevel = async (
    areaName: RuntimeProxyStorageAreaName,
    area: ChromeNamespace,
    runtime: ChromeNamespace | undefined,
    callArguments: unknown[],
  ): Promise<RuntimeProxyStorageResult> => {
    const nativeSetAccessLevel = nativeSetAccessLevels.get(areaName);

    if (!nativeSetAccessLevel) {
      return { status: "error", message: STORAGE_UNAVAILABLE_ERROR };
    }

    const result = await invokeNativeMethod(runtime, area, nativeSetAccessLevel, callArguments);

    const requested = (callArguments[0] as { accessLevel?: unknown } | undefined)?.accessLevel;

    // Only a level the native call accepted, so a refusal changes nothing here
    if (result.status === "ok" && isStorageAccessLevel(requested)) {
      accessLevels.set(areaName, requested);

      await reportAccessLevel({ area: areaName, accessLevel: requested });
    }

    return result;
  };

  /** Answers one relayed call against the worker session's own store. */
  const run = (
    call: RuntimeProxyStorageCall,
    isTrustedContext: boolean,
  ): Promise<RuntimeProxyStorageResult> => {
    const refusal = refuseStorageCall(
      call,
      isTrustedContext,
      accessLevels.get(call.area) ?? DEFAULT_STORAGE_ACCESS_LEVELS[call.area],
    );

    if (refusal !== undefined) {
      return Promise.resolve({ status: "error", message: refusal });
    }

    const resolved = getArea(call.area);

    if (!resolved) {
      return Promise.resolve({ status: "error", message: STORAGE_UNAVAILABLE_ERROR });
    }

    if (call.method === "setAccessLevel") {
      return setAccessLevel(call.area, resolved.area, resolved.runtime, call.arguments);
    }

    const method = resolved.area[call.method];

    if (typeof method !== "function") {
      return Promise.resolve({ status: "error", message: STORAGE_UNAVAILABLE_ERROR });
    }

    return invokeNativeMethod(
      resolved.runtime,
      resolved.area,
      method as NativeMethod,
      call.arguments,
    );
  };

  return { mirrorAccessLevels, run, watchChanges };
}
