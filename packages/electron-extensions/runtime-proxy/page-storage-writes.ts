import { postBridge } from "../facade/lib/bridge";
import type { ChromeNamespace } from "../facade/lib/chrome";
import { RUNTIME_PROXY_PATHS } from "./bridge-protocol";
import { shadowStorageWrites } from "./storage-synthesis";

/**
 * Reports what an extension page in the worker's own session writes to the
 * store, so the worker hears it.
 *
 * The page writes natively and its own native `onChanged` fires, as does every
 * other page's in the session, but Electron delivers no change event to the
 * worker. Synthesis covers the worker's own writes and every relayed one,
 * since all of those pass through its `chrome.storage`; a page's write never
 * does. Bitwarden's popout is such a page, and what it writes is what the
 * worker waits on: the user key an unlock stores, the cipher a passkey is
 * saved into. The worker kept its stale state until it next started, so the
 * inline menu went on offering Unlock, and a passkey create timed out waiting
 * for a cipher the popout had already saved.
 *
 * The writes are shadowed the way synthesis shadows the worker's own, and each
 * change goes to main, which hands it to the worker's synthesized events. The
 * page's native events are left alone, being the ones that already work.
 */
export function reportPageStorageWrites(extensionApi: ChromeNamespace) {
  shadowStorageWrites([extensionApi], (area, changes) => {
    void postBridge(RUNTIME_PROXY_PATHS.pageStorageChanged, { area, changes }).catch(
      () => undefined,
    );
  });
}
