import type { ChromeNamespace } from "../facade/lib/chrome";
import { createRelayClient } from "./relay-client";

/**
 * Entry point of the runtime proxy's worker-side relay client. It is bundled
 * on its own and imported by the derived service worker wrapper between the
 * facade and the extension's own background script, so its wrapped `onMessage`
 * and `onConnect` are what the extension registers its listeners on, and its
 * shadowed `tabs.sendMessage`, `tabs.connect` and `runtime.sendMessage` are
 * what the extension calls to reach the sessions it has no worker in. One
 * client serves both `chrome` and `browser`, sharing one set of listeners.
 */
const workerGlobals = globalThis as unknown as Record<string, ChromeNamespace | undefined>;

const relayClient = createRelayClient();

for (const globalName of ["chrome", "browser"]) {
  const extensionApi = workerGlobals[globalName];

  if (extensionApi) {
    relayClient.wrapRuntime(extensionApi);

    relayClient.wrapTabs(extensionApi);
  }
}

relayClient.start();
