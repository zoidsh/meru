import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { AppLifecycle } from "#platform/app.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import type { SettingsStore } from "../settings.ts";
import { createUpdates } from "../updates.ts";
import { systemUpdater } from "./test-build.ts";

/**
 * Meru's updates, on the installed Meru's updater alone; `start` once the
 * window shows.
 */
export const wireUpdates = async ({
  lifecycle,
  settings,
  runningVersion,
  systemBrowser,
  log,
}: {
  lifecycle: Pick<AppLifecycle, "quitThen" | "quit" | "onBeforeQuit">;
  settings: SettingsStore;
  runningVersion: string;
  /** Meru's own links' browser: the release page is Meru's link. */
  systemBrowser: Pick<SystemBrowser, "open">;
  log: Log;
}) => {
  const updates = createUpdates({
    updater: await systemUpdater(),
    settings,
    runningVersion,
    quitThen: lifecycle.quitThen,
    quit: lifecycle.quit,
    openExternal: async (url) => {
      try {
        await systemBrowser.open(url);
      } catch (error) {
        log("release-page-open-failed", { error: scrub.error(error) });
      }
    },
    now: Date.now,
    log,
  });

  lifecycle.onBeforeQuit(updates.dispose);

  return updates;
};
