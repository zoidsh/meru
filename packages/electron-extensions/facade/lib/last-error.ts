import type { ChromeNamespace } from "./chrome";

/**
 * `chrome.runtime.lastError` the way Chrome exposes it: set for the duration of
 * the callback that reads it, gone again afterwards.
 */
export function withLastError(
  runtime: ChromeNamespace,
  error: string | undefined,
  run: () => void,
) {
  if (error === undefined) {
    run();

    return;
  }

  runtime.lastError = { message: error };

  try {
    run();
  } finally {
    delete runtime.lastError;
  }
}

export function getLastErrorMessage(runtime: ChromeNamespace) {
  return (runtime.lastError as { message?: string } | undefined)?.message;
}

/**
 * The `runtime` an extension reads `lastError` from, looked up at call time
 * because a facade namespace is built before it is installed into `chrome`.
 * A context with none gets an object nothing reads, so the callback still runs.
 */
export function getContextRuntime(): ChromeNamespace {
  const extensionApi = (globalThis as unknown as Record<string, ChromeNamespace | undefined>)
    .chrome;

  return (extensionApi?.runtime as ChromeNamespace | undefined) ?? {};
}
