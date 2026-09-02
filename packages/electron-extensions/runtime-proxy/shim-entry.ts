import type { ChromeNamespace } from "../facade/lib/chrome";
import { createPageStreamClient } from "./page-stream-client";
import { getContextSenderReport, installRuntimeProxyShim } from "./shim";

/**
 * Entry point of the runtime proxy's shim. It is bundled on its own, like the
 * facade, and a content-script-only copy runs it in every context of the
 * extension that can message: the derive prepends it to every `content_scripts`
 * entry, so it reaches the isolated world before the extension's own scripts,
 * and writes it into every extension page — the action popup, and the frames an
 * extension embeds in web pages — ahead of the page's own. Electron hands these
 * contexts the extension API under both `chrome` and `browser`, so both get the
 * shadowed `runtime` methods and both dispatch what the worker sends.
 */
const contextGlobals = globalThis as unknown as Record<string, ChromeNamespace | undefined>;

const pageStreamClient = createPageStreamClient({ getSenderReport: getContextSenderReport });

for (const globalName of ["chrome", "browser"]) {
  const extensionApi = contextGlobals[globalName];

  if (extensionApi) {
    installRuntimeProxyShim(extensionApi);

    pageStreamClient.wrapRuntime(extensionApi);
  }
}

pageStreamClient.start();
