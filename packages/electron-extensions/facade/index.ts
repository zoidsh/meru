import { installChromeFacade } from "./install";
import { removeBrowserGlobal } from "./lib/browser-global";
import type { ChromeNamespace } from "./lib/chrome";

/**
 * Entry point of the script that runs in extension contexts before any
 * extension code. It is bundled on its own and copied into the derived
 * extension directory, so it must stand alone: no Node, no DOM, no imports
 * beyond this package.
 */
removeBrowserGlobal();

const { chrome } = globalThis as unknown as { chrome?: ChromeNamespace };

if (chrome) {
  installChromeFacade(chrome);
}
