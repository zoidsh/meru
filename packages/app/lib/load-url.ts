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

/**
 * Brings a view up on the history its tab hibernated with, and settles for the
 * page itself when that history cannot be restored — a restore that never
 * commits otherwise leaves a blank view under a tab still wearing the title it
 * went to sleep with, with nothing the user can do about it. Losing the back
 * stack and the scroll position is the price of the page being there at all.
 *
 * A view with no history to come back to is loaded outright, which is every
 * tab that was opened rather than woken.
 */
export async function loadUrlOrRestoreNavigationHistory(
  webContents: WebContents,
  url: string,
  navigationHistory?: RestoreOptions,
) {
  if (!navigationHistory) {
    return loadUrl(webContents, url);
  }

  const restored = await restoreNavigationHistory(webContents, navigationHistory);

  // A tab closed while its restore was in flight has no view left to load into,
  // and reaching for one throws rather than answering false.
  if (restored || webContents.isDestroyed()) {
    return restored;
  }

  return loadUrl(webContents, url);
}
