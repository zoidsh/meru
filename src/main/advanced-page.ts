import type { SettingsState } from "#contract/settings.ts";
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
  log: Log;
}

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
      log("settings-file-open-failed", { error: scrub.error(error) });
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
});

export type AdvancedPage = ReturnType<typeof createAdvancedPage>;
