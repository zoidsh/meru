/**
 * Takes away the `browser` global Electron defines next to `chrome` in every
 * extension context — the worker, extension pages and content scripts' isolated
 * worlds — where Chrome defines only `chrome`. Extensions pick their code path
 * by it: Bitwarden takes its Firefox paths with it present, and 1Password uses
 * it in place of the `webextension-polyfill` wrapper it builds over `chrome` in
 * Chrome. Both are tested on Chrome's path, so that is the one they get.
 *
 * It has to run before any of the extension's own code, which reads it once at
 * startup.
 *
 * Only where `chrome.runtime.id` names an extension: the derive prepends the
 * shim to `world: "MAIN"` entries too, and a `browser` there is the page's own.
 */
export function removeBrowserGlobal() {
  const contextGlobals = globalThis as unknown as Record<string, unknown>;

  const runtime = (contextGlobals.chrome as { runtime?: { id?: unknown } } | undefined)?.runtime;

  if (typeof runtime?.id !== "string") {
    return;
  }

  delete contextGlobals.browser;
}
