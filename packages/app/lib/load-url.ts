import type { RestoreOptions, WebContents } from "electron";
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

/**
 * Brings a view back on the history the tab it belongs to went away with, so
 * back and forward keep working and each page returns to the scroll position
 * and form values it was left at. Restoring loads the entry it lands on, so it
 * answers whether the page arrived just as `loadUrl` does.
 */
export function restoreNavigationHistory(webContents: WebContents, options: RestoreOptions) {
  return webContents.navigationHistory
    .restore(options)
    .then(() => true)
    .catch((error: unknown) => {
      log.error("Failed to restore navigation history", {
        url: options.entries.at(options.index ?? -1)?.url,
        error: serializeError(error),
      });

      return false;
    });
}
