import type { ChromeNamespace } from "../facade/lib/chrome";
import { RUNTIME_PROXY_RELAY_START_GLOBAL } from "./bridge-protocol";
import { createRelayClient } from "./relay-client";
import { createStorageRelay } from "./storage-relay";

/**
 * Entry point of the runtime proxy's worker-side relay client. It is bundled
 * on its own and imported by the derived service worker wrapper between the
 * facade and the extension's own background script, so its wrapped `onMessage`
 * and `onConnect` are what the extension registers its listeners on, and its
 * shadowed `tabs.sendMessage`, `tabs.connect` and `runtime.sendMessage` are
 * what the extension calls to reach the sessions it has no worker in. One
 * client serves both `chrome` and `browser`, sharing one set of listeners.
 *
 * The same client answers the other sessions' `chrome.storage` calls against
 * this session's own store, which is the one store the shared instance keeps.
 * That store stays native: the relay reads and writes it through the same API
 * the extension does, and shadows nothing on it but `setAccessLevel`, whose
 * value Chrome offers no way to read back and which the relay has to know to
 * refuse a content script the call Chromium would have refused it.
 */
const workerGlobals = globalThis as unknown as Record<string, ChromeNamespace | undefined>;

const extensionApis = ["chrome", "browser"]
  .map((globalName) => workerGlobals[globalName])
  .filter((extensionApi): extensionApi is ChromeNamespace => extensionApi !== undefined);

const storageRelay = createStorageRelay(extensionApis);

const relayClient = createRelayClient({ runStorageCall: storageRelay.run });

for (const extensionApi of extensionApis) {
  relayClient.wrapRuntime(extensionApi);

  relayClient.wrapTabs(extensionApi);
}

// Before the extension's own background script runs, so its own boot-time call
// is the first one the relay sees
storageRelay.mirrorAccessLevels();

/*
 * The stream is parked by the derived wrapper, as the last thing it does,
 * rather than here. Parking during this module's evaluation would take jobs
 * before the extension's own top-level code had run — before the
 * `setAccessLevel` an extension calls at startup, in particular — where Chrome
 * dispatches nothing to a worker until its script has finished evaluating.
 */
(workerGlobals as unknown as Record<string, () => void>)[RUNTIME_PROXY_RELAY_START_GLOBAL] = () => {
  relayClient.start();
};
