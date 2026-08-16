import { createChromeFacade, installChromeFacade } from "./install";
import type { ChromeNamespace } from "./lib/chrome";

/**
 * Entry point of the script that runs in extension contexts before any
 * extension code. It is bundled on its own and copied into the derived
 * extension directory, so it must stand alone: no Node, no DOM, no imports
 * beyond this package.
 *
 * Electron puts the extension API under two globals, `chrome` and `browser`,
 * as two separate objects with the same namespaces — measured 2026-08-16 in an
 * extension service worker, and the reason 1Password crashed on
 * `browser.windows.WINDOW_ID_NONE` while `chrome.windows` was already complete.
 * Both are filled from one facade, so a namespace promoted to a real
 * implementation later has one set of listeners, whichever global reached it.
 */
const extensionGlobals = globalThis as unknown as Record<string, ChromeNamespace | undefined>;

const facade = createChromeFacade();

for (const globalName of ["chrome", "browser"]) {
  const extensionApi = extensionGlobals[globalName];

  if (extensionApi) {
    installChromeFacade(extensionApi, facade);
  }
}
