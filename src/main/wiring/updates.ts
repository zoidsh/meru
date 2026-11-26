import { homedir } from "node:os";

import type { AppLifecycle } from "#platform/app.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import type { SettingsStore } from "../settings.ts";
import { createUpdates } from "../updates.ts";
import { systemUpdater } from "./test-build.ts";

/**
 * Meru's updates, on the installed Meru's updater alone; `start` once the
 * window shows.
 */
export const wireUpdates = ({
  lifecycle,
  settings,
  runningVersion,
  systemBrowser,
}: {
  lifecycle: Pick<AppLifecycle, "quitThen" | "quit" | "onBeforeQuit">;
  settings: SettingsStore;
  runningVersion: string;
  /** Meru's own links' browser: the release page is Meru's link. */
  systemBrowser: Pick<SystemBrowser, "open">;
}) => {
  const updates = createUpdates({
    updater: systemUpdater(),
    settings,
    runningVersion,
    quitThen: lifecycle.quitThen,
    quit: lifecycle.quit,
    openExternal: async (url) => {
      try {
        await systemBrowser.open(url);
      } catch (error) {
        console.error(`Could not open the release page: ${String(error)}`);
      }
    },
    home: homedir(),
    now: Date.now,
    log: console.error,
  });

  lifecycle.onBeforeQuit(updates.dispose);

  return updates;
};
