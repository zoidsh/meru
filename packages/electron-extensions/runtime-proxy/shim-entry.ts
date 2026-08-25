import type { ChromeNamespace } from "../facade/lib/chrome";
import { installRuntimeProxyShim } from "./shim";

/**
 * Entry point of the runtime proxy's content-script shim. It is bundled on its
 * own, like the facade, and the derive prepends it to every `content_scripts`
 * entry of a content-script-only copy, so it runs in the extension's isolated
 * world before any of the extension's own scripts. Electron hands content
 * scripts the extension API under both `chrome` and `browser`, so both get the
 * shadowed `runtime` methods.
 */
const contentScriptGlobals = globalThis as unknown as Record<string, ChromeNamespace | undefined>;

for (const globalName of ["chrome", "browser"]) {
  const extensionApi = contentScriptGlobals[globalName];

  if (extensionApi) {
    installRuntimeProxyShim(extensionApi);
  }
}
