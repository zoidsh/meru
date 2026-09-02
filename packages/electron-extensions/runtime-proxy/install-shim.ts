import type { ChromeNamespace } from "../facade/lib/chrome";
import type { RuntimeProxySenderReport } from "./bridge-protocol";
import { createPageStreamClient } from "./page-stream-client";
import { getContextSenderReport, installRuntimeProxyShim } from "./shim";

/**
 * Where a context records that it has been shimmed. A content script's isolated
 * world is invisible to the page and an extension page's window is the
 * extension's own, so this is only ever read by the shim's own second run.
 */
const INSTALLED_GLOBAL = "__meruRuntimeProxyShimInstalled";

export type InstallShimOptions = {
  getSenderReport?: () => RuntimeProxySenderReport;
  retryDelayMs?: number;
};

/**
 * Everything a shimmed context installs, exactly once however often the bundle
 * runs.
 *
 * Once is not a given: the derive prepends the shim to *every* `content_scripts`
 * entry, and Chromium runs each matching entry's scripts in the same isolated
 * world — so a page matching three of an extension's entries runs this bundle
 * three times in one world. 1Password has three entries reaching Google, all
 * `all_frames` at `document_start`, so three is the real number rather than a
 * hypothetical one.
 *
 * Without the guard each run parked a page stream of its own and evicted its
 * siblings', which re-parked a second later and evicted this one in turn:
 * about three parks a second per frame, for as long as the page was open, with
 * every message in flight failing as a closed port and every worker-opened port
 * disconnecting. It could not be seen in the end-to-end suite, whose fixture
 * declares one entry.
 *
 * Returns the page-stream client on the run that installs, and nothing on the
 * runs that do not — which is what a test asserts on.
 */
export function installShim({ getSenderReport, retryDelayMs }: InstallShimOptions = {}) {
  const contextGlobals = globalThis as unknown as Record<string, unknown>;

  if (contextGlobals[INSTALLED_GLOBAL] === true) {
    return undefined;
  }

  contextGlobals[INSTALLED_GLOBAL] = true;

  const pageStreamClient = createPageStreamClient({
    getSenderReport: getSenderReport ?? getContextSenderReport,
    retryDelayMs,
  });

  // Electron hands a context the extension API under both names, as two
  // objects, and an extension reads whichever it was written against
  for (const globalName of ["chrome", "browser"]) {
    const extensionApi = (contextGlobals as Record<string, ChromeNamespace | undefined>)[
      globalName
    ];

    if (extensionApi) {
      installRuntimeProxyShim(extensionApi);

      pageStreamClient.wrapRuntime(extensionApi);
    }
  }

  pageStreamClient.start();

  return pageStreamClient;
}
