import path from "node:path";

import { t } from "@lingui/core/macro";

import type { LogsExport, SettingsState } from "#contract/settings.ts";
import type { BrowsingDataKinds } from "#core/browsing-data.ts";
import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { State } from "#core/state.ts";
import type { PathOpener } from "#platform/path-opener.ts";
import type { TextFile } from "#platform/text-file.ts";

import type { Profiles } from "./profiles.ts";
import type { SettingsStore } from "./settings.ts";

export interface AdvancedPageDeps {
  /** Whether this run started with hardware acceleration. */
  hardwareAccelerationAtLaunch: boolean;
  settingsFile: Pick<TextFile, "path" | "read">;
  settings: Pick<SettingsStore, "saveAsIs">;
  opener: PathOpener;
  profiles: Pick<Profiles, "locked"> & { get: () => State };
  /** Delete browsing data's own path, which reloads the profile's pages. */
  deleteBrowsingData: (
    profileId: string,
    kinds: BrowsingDataKinds
  ) => Promise<void>;
  /** The log, copied with whatever still waits to be written. */
  logs: { copyTo: (destination: string) => Promise<void> };
  /** The system's save dialog: the file chosen, or nothing once canceled. */
  pickSaveFile: (defaultPath: string) => Promise<string | undefined>;
  /** Where the save dialog opens. */
  downloadsFolder: () => string;
  productName: string;
  now: () => Date;
  log: Log;
}

/** The day in the person's own time zone, as `2026-11-27`. */
const localDay = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const CACHE_ONLY: BrowsingDataKinds = { cookies: false, cache: true };

/**
 * What the Advanced page does that is not a plain setting: the hardware
 * acceleration this run started with, opening `settings.json`, and clearing
 * every profile's cache.
 */
export const createAdvancedPage = ({
  hardwareAccelerationAtLaunch,
  settingsFile,
  settings,
  opener,
  profiles,
  deleteBrowsingData,
  logs,
  pickSaveFile,
  downloadsFolder,
  productName,
  now,
  log,
}: AdvancedPageDeps) => ({
  read: (): SettingsState["advanced"] => ({ hardwareAccelerationAtLaunch }),
  /** In the system's handler for it, saved first when there is no file yet. */
  openSettingsFile: async () => {
    try {
      if ((await settingsFile.read()) === undefined) {
        await settings.saveAsIs();
      }

      await opener.open(settingsFile.path);
    } catch (error) {
      log("settings-file-open-failed", { code: scrub.code(error) });
    }
  },
  /**
   * The cache alone of every stored profile, disabled, asleep or unused by
   * this run; rejects once all have settled when any could not be cleared.
   */
  clearCache: async () => {
    const ids = [...profiles.get().profiles, ...profiles.locked()].map(
      (profile) => profile.id
    );
    const results = await Promise.allSettled(
      ids.map((profileId) => deleteBrowsingData(profileId, CACHE_ONLY))
    );
    const failed: string[] = [];

    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        failed.push(ids[index] ?? "");
        log("cache-clear-failed", {
          profile: scrub.profile(ids[index] ?? ""),
          error: scrub.error(result.reason),
        });
      }
    }

    if (failed.length > 0) {
      throw new Error(`The cache of ${failed.join(", ")} was not cleared`);
    }
  },
  /** A copy of the log where the person saves it. */
  exportLogs: async (): Promise<LogsExport> => {
    const day = localDay(now());
    const name = t({
      message: `${productName} logs ${day}.txt`,
      comment:
        "The file name the Save dialog suggests for a copy of the app's logs; {day} is the date as 2026-11-27",
    });

    try {
      const chosen = await pickSaveFile(path.join(downloadsFolder(), name));

      if (chosen === undefined) {
        return "canceled";
      }

      await logs.copyTo(chosen);
      log("logs-exported");

      return "saved";
    } catch (error) {
      log("logs-export-failed", { code: scrub.code(error) });

      return "failed";
    }
  },
});

export type AdvancedPage = ReturnType<typeof createAdvancedPage>;
