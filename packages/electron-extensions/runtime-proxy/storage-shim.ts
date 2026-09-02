import { postBridge } from "../facade/lib/bridge";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { withLastError } from "../facade/lib/last-error";
import {
  RUNTIME_PROXY_PATHS,
  type RuntimeProxySenderReport,
  type RuntimeProxyStorageCallRequest,
} from "./bridge-protocol";
import {
  STORAGE_AREA_NAMES,
  STORAGE_METHOD_NAMES,
  STORAGE_UNAVAILABLE_ERROR,
  type RuntimeProxyStorageAreaName,
  type RuntimeProxyStorageCall,
  type RuntimeProxyStorageMethodName,
  type RuntimeProxyStorageResult,
} from "./storage-protocol";

/**
 * Where an area this shim has shadowed keeps what the shadowing needs. The shim
 * is prepended to every `content_scripts` entry, and several entries can match
 * one page — 1Password has eight — so a page runs it once per matching entry,
 * in the same isolated world, against the same `chrome.storage`. A second
 * install shadows nothing again and adds its runtime to what is already here,
 * so one chain still orders the area's calls and `lastError` still reaches
 * whichever global the caller was written against. The property is
 * non-enumerable, so an extension walking the area sees the members Chrome
 * puts there and nothing of Meru's.
 */
const SHADOWED_AREA_MARK = "__meruRuntimeProxyStorageShim";

type ShadowedArea = {
  /**
   * Every runtime object whose global shares this area. Electron builds
   * `chrome` and `browser` separately and may hand back one area object for
   * both, so an error has to reach the `lastError` of each — a listener reads
   * whichever global it was written against, as `relay-client.ts` found.
   */
  runtimes: ChromeNamespace[];
  /** The area's one call chain, shared by every install that finds it. */
  chain: { promise: Promise<unknown> };
};

/** What a refused bridge call reads as, whatever the call was. */
function bridgeAnsweredError(status: number) {
  return `The runtime proxy bridge answered ${status}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What a shimmed context can say about where it runs, the same two facts
 * messaging reports. The relay holds them against the frame Chromium recorded
 * as the caller before it decides whether this is one of the extension's own
 * documents or a content script.
 */
function getContextSenderReport(): RuntimeProxySenderReport {
  const contextGlobals = globalThis as unknown as {
    location?: { href?: string };
    self?: unknown;
    top?: unknown;
  };

  return {
    url: contextGlobals.location?.href ?? "",
    isTopFrame: contextGlobals.self === contextGlobals.top,
  };
}

async function relayStorageCall(
  call: RuntimeProxyStorageCall,
  getSenderReport: () => RuntimeProxySenderReport,
): Promise<unknown> {
  const request: RuntimeProxyStorageCallRequest = { call, sender: getSenderReport() };

  /*
   * Serialization is checked before anything is sent, so that a value the
   * bridge cannot carry fails as the caller's own error rather than as the
   * unreachable store it is not. Chrome's storage is JSON too, so what fails
   * here would not have survived a native `set` either.
   */
  try {
    JSON.stringify(request);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }

  let result: RuntimeProxyStorageResult;

  try {
    const response = await postBridge(RUNTIME_PROXY_PATHS.storageCall, request);

    if (!response.ok) {
      throw new Error(bridgeAnsweredError(response.status));
    }

    result = (await response.json()) as RuntimeProxyStorageResult;
  } catch {
    // An unreachable bridge is a store this context cannot reach, which is
    // what the relay says when the worker is gone as well
    throw new Error(STORAGE_UNAVAILABLE_ERROR);
  }

  if (result?.status === "ok") {
    return result.value;
  }

  throw new Error(
    result?.status === "error" && typeof result.message === "string"
      ? result.message
      : STORAGE_UNAVAILABLE_ERROR,
  );
}

/**
 * One shadowed area method, in Chrome's dual form: a trailing callback is
 * answered with `runtime.lastError` set for its duration, and a caller that
 * passes none gets a promise that rejects, exactly as `createBridgedMethod`
 * does it for the facade.
 *
 * Every call on an area goes on that area's chain. Chrome's backend serializes
 * an area's operations, so a `set` followed by a `get` observes the write;
 * two bridge posts have no order between them at all, and unchained the read
 * could overtake the write it was written after.
 */
function createShadowedMethod(
  shadowed: ShadowedArea,
  area: RuntimeProxyStorageAreaName,
  method: RuntimeProxyStorageMethodName,
  getSenderReport: () => RuntimeProxySenderReport,
) {
  return (...callArguments: unknown[]) => {
    const callback =
      typeof callArguments.at(-1) === "function"
        ? (callArguments.pop() as (result?: unknown) => void)
        : undefined;

    /*
     * Chrome takes a trailing `undefined` or `null` for an omitted optional
     * argument, and JSON turns `undefined` into `null` on the way over, so a
     * surplus one would reach the worker as a real argument and be refused by
     * Chromium's own signature matching — `get("k", undefined)` would fail
     * where it succeeds natively.
     */
    while (callArguments.length > 0 && callArguments.at(-1) == null) {
      callArguments.pop();
    }

    const answer = shadowed.chain.promise.then(() =>
      relayStorageCall({ area, method, arguments: callArguments }, getSenderReport),
    );

    // The chain must survive a failed call, or one refusal would wedge the area
    shadowed.chain.promise = answer.catch(() => undefined);

    if (!callback) {
      return answer;
    }

    answer.then(
      (value) => {
        callback(value);
      },
      (error: Error) => {
        withRuntimesLastError(shadowed.runtimes, error.message, () => {
          callback(undefined);
        });
      },
    );

    return undefined;
  };
}

/**
 * `lastError` around a callback, set on every runtime object that shares the
 * area. The same shape `relay-client.ts` needs, and for the same reason.
 */
function withRuntimesLastError(runtimes: ChromeNamespace[], error: string, run: () => void) {
  let answer = run;

  for (const runtime of runtimes) {
    const nextAnswer = answer;

    answer = () => {
      withLastError(runtime, error, nextAnswer);
    };
  }

  answer();
}

function shadowArea(
  runtime: ChromeNamespace | undefined,
  storage: ChromeNamespace,
  areaName: RuntimeProxyStorageAreaName,
  getSenderReport: () => RuntimeProxySenderReport,
) {
  const area = storage[areaName];

  if (typeof area !== "object" || area === null) {
    return;
  }

  const areaNamespace = area as ChromeNamespace;

  const alreadyShadowed = areaNamespace[SHADOWED_AREA_MARK] as ShadowedArea | undefined;

  if (alreadyShadowed) {
    if (runtime && !alreadyShadowed.runtimes.includes(runtime)) {
      alreadyShadowed.runtimes.push(runtime);
    }

    return;
  }

  const shadowed: ShadowedArea = {
    runtimes: runtime ? [runtime] : [],
    chain: { promise: Promise.resolve() },
  };

  for (const method of STORAGE_METHOD_NAMES) {
    // Only what Electron already implements: an extension feature-detects the
    // newer methods, and one the worker's own store lacks could not be
    // answered there either
    if (typeof areaNamespace[method] !== "function") {
      continue;
    }

    areaNamespace[method] = createShadowedMethod(shadowed, areaName, method, getSenderReport);
  }

  try {
    Object.defineProperty(areaNamespace, SHADOWED_AREA_MARK, {
      value: shadowed,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // A mark Chromium will not let us set costs a second install its own
    // chain, which still answers correctly
  }
}

export type InstallRuntimeProxyStorageShimOptions = {
  getSenderReport?: () => RuntimeProxySenderReport;
};

/**
 * Shadows the `chrome.storage` area methods in a context of a
 * content-script-only session, pointing them at the one store the worker's
 * session keeps instead of at this session's own, which the worker never sees
 * and nothing else writes to. It runs before any of the extension's own code,
 * so the extension only ever sees the shadowed methods.
 *
 * `onChanged`, on the areas and on `chrome.storage` itself, is left exactly as
 * Electron made it, and therefore never fires here: every write now lands in
 * the worker's store, so this session's own store — the only thing its native
 * event watches — stops changing. That is no events rather than wrong ones,
 * and it is what the worker-to-page channel replaces when it lands.
 *
 * The area constants are untouched too. `QUOTA_BYTES` and its siblings are
 * read straight off the area at extension startup, and the methods are
 * replaced on Chrome's own objects rather than the objects being swapped, so
 * everything the proxy has nothing to say about stays where Chrome put it.
 */
export function installRuntimeProxyStorageShim(
  extensionApi: ChromeNamespace,
  { getSenderReport = getContextSenderReport }: InstallRuntimeProxyStorageShimOptions = {},
) {
  const storage = extensionApi.storage as ChromeNamespace | undefined;

  if (!storage) {
    return;
  }

  const runtime = extensionApi.runtime as ChromeNamespace | undefined;

  for (const areaName of STORAGE_AREA_NAMES) {
    shadowArea(runtime, storage, areaName, getSenderReport);
  }
}
