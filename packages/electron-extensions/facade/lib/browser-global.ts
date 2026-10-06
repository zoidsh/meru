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
 */
export function removeBrowserGlobal() {
  delete (globalThis as unknown as Record<string, unknown>).browser;
}
