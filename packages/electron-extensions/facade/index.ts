import { RUNTIME_PROXY_PAGE_STORAGE_WRITES_GLOBAL } from "../runtime-proxy/bridge-protocol";
import { reportPageStorageWrites } from "../runtime-proxy/page-storage-writes";
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

const contextGlobals = globalThis as unknown as {
  chrome?: ChromeNamespace;
  document?: unknown;
  [RUNTIME_PROXY_PAGE_STORAGE_WRITES_GLOBAL]?: boolean;
};

const { chrome } = contextGlobals;

if (chrome) {
  installChromeFacade(chrome);

  // The worker copy's facade runs in the worker too, where synthesis already
  // sees every write, so only a document reports
  if (
    contextGlobals[RUNTIME_PROXY_PAGE_STORAGE_WRITES_GLOBAL] &&
    contextGlobals.document !== undefined
  ) {
    reportPageStorageWrites(chrome);
  }
}
