import type { ShellState } from "#contract/shell.ts";
import { canRemoveProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { AppWindow } from "#platform/window.ts";

import {
  profileDisplayName,
  removeProfileConfirmation,
  removeProfileMenuLabel,
} from "./profile-copy.ts";
import type { Profiles } from "./profiles.ts";
import type { ShellHandlers } from "./shell-ipc.ts";

export interface ShellHandlersDeps {
  profiles: Pick<Profiles, "get" | "select" | "add" | "remove">;
  window: Pick<AppWindow, "showContextMenu" | "confirm">;
  log: (message: string) => void;
}

/** The slices the shell sees of main's state, names ready to show. */
export const shellState = (state: State): ShellState => ({
  profiles: {
    profiles: state.profiles.map((profile) => ({
      id: profile.id,
      name: profileDisplayName(profile),
    })),
    selectedProfileId: state.selectedProfileId,
  },
});

export const createShellHandlers = ({
  profiles,
  window,
  log,
}: ShellHandlersDeps): ShellHandlers => {
  const confirmAndRemove = async (profileId: string, name: string) => {
    try {
      if (await window.confirm(removeProfileConfirmation(name))) {
        await profiles.remove(profileId);
      }
    } catch (error) {
      log(
        `Profile ${profileId} was not removed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  return {
    selectProfile: async ({ profileId }) => {
      await profiles.select(profileId);
    },
    addProfile: async () => {
      await profiles.add();
    },
    openProfileMenu: ({ profileId }) => {
      const state = profiles.get();
      const profile = state.profiles.find(
        (candidate) => candidate.id === profileId
      );

      if (profile) {
        const name = profileDisplayName(profile);

        window.showContextMenu([
          {
            label: removeProfileMenuLabel(name),
            enabled: canRemoveProfile(state, profileId),
            click: () => {
              confirmAndRemove(profileId, name);
            },
          },
        ]);
      }

      return Promise.resolve();
    },
  };
};
