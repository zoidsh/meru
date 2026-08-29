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
