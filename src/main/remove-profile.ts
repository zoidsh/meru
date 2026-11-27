import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { AppWindow } from "#platform/window.ts";

import {
  profileDisplayName,
  removeProfileConfirmation,
} from "./profile-copy.ts";
import type { Profiles } from "./profiles.ts";

export interface RemoveProfileDeps {
  profiles: Pick<Profiles, "get" | "remove">;
  window: Pick<AppWindow, "confirm">;
  log: Log;
}

/** Asks to remove the profile, and removes it once confirmed. */
export const createRemoveProfile =
  ({ profiles, window, log }: RemoveProfileDeps) =>
  async (profileId: string) => {
    const profile = profiles
      .get()
      .profiles.find((candidate) => candidate.id === profileId);

    if (!profile) {
      return;
    }

    try {
      if (
        await window.confirm(
          removeProfileConfirmation(profileDisplayName(profile))
        )
      ) {
        await profiles.remove(profileId);
      }
    } catch (error) {
      log("profile-remove-failed", {
        profile: scrub.profile(profileId),
        error: scrub.error(error),
      });
    }
  };
