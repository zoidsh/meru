import { protocol } from "electron";
import { NATIVE_MESSAGING_SCHEME } from "./bridge-protocol";

/**
 * Registers the scheme the native messaging bridge answers on. Electron only
 * takes scheme privileges before the app is ready, so an embedder has to call
 * this while its modules are still loading.
 *
 * `supportFetchAPI` and `corsEnabled` are what let an extension context fetch
 * the scheme at all, and `allowServiceWorkers` is what extends that to service
 * workers: without it a fetch from an extension's service worker — the context
 * that matters here — fails with "Failed to fetch" before the handler is ever
 * asked (measured on Electron 43.2.0). Nothing can navigate to the scheme, so
 * the workers it allows to be registered on it are hypothetical.
 */
export function registerNativeMessagingScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: NATIVE_MESSAGING_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        allowServiceWorkers: true,
      },
    },
  ]);
}
