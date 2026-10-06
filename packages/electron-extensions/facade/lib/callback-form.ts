import type { ChromeNamespace } from "./chrome";

/**
 * Calls `method` the way a `webextension-polyfill`-shaped wrapper over `chrome`
 * does, for tests: in callback form, reading `runtime.lastError` inside the
 * callback and rejecting with it. 1Password builds such a wrapper whenever no
 * `browser` global exists, so every facade method has to survive this.
 */
export function callInCallbackForm(
  runtime: ChromeNamespace,
  method: (...callArguments: unknown[]) => unknown,
  ...callArguments: unknown[]
) {
  let returned: unknown;

  const answered = new Promise<unknown>((resolve, reject) => {
    returned = method(...callArguments, (...results: unknown[]) => {
      const lastError = runtime.lastError as { message?: string } | undefined;

      if (lastError) {
        reject(new Error(lastError.message));

        return;
      }

      resolve(results[0]);
    });
  });

  return { returned, answered };
}
