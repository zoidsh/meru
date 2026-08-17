import type { WebContents } from "electron";
import { serializeError } from "serialize-error";
import { log } from "./log";

/**
 * `loadURL` rejects when the load never commits — a renderer that went away
 * mid-navigation, a network stack that gave up — and nothing waits on the
 * promise, which turns every such load into an unhandled rejection. Says what
 * happened and answers whether the page arrived.
 *
 * Lives apart from `web-contents.ts`, which reaches into app modules that in
 * turn import `popup.ts`: importing it from `popup.ts` or `window.ts` closes an
 * import cycle that leaves `Popup` undefined at app launch.
 */
export function loadUrl(webContents: WebContents, url: string) {
  return webContents
    .loadURL(url)
    .then(() => true)
    .catch((error: unknown) => {
      log.error("Failed to load URL", { url, error: serializeError(error) });

      return false;
    });
}
