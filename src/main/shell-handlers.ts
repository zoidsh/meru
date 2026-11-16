import type { ShellState } from "#contract/shell.ts";
import { canRemoveProfile, knownTabs, selectedProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabStatus } from "#core/tab-machine.ts";
import { canCloseTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { AppWindow } from "#platform/window.ts";

import {
  profileDisplayName,
  removeProfileConfirmation,
  removeProfileMenuLabel,
} from "./profile-copy.ts";
import type { Profiles } from "./profiles.ts";
import type { ShellHandlers } from "./shell-ipc.ts";

export interface ShellHandlersDeps {
  profiles: Pick<
    Profiles,
    "get" | "select" | "add" | "remove" | "selectTab" | "closeTab"
  >;
  tabs: { retry: (key: TabKey) => void };
  window: Pick<AppWindow, "showContextMenu" | "confirm">;
  log: (message: string) => void;
}

type ShellTabStatus = ShellState["tabs"]["tabs"][number]["status"];

const shellTabStatus = (status: TabStatus): ShellTabStatus => {
  switch (status.kind) {
    case "failed": {
      return {
        kind: "failed",
        reason: status.reason.name,
        retrying: status.retrying,
      };
    }
    case "crashed": {
      return { kind: "crashed" };
    }
    default: {
      return { kind: status.kind };
    }
  }
};

/** The slices the shell sees of main's state, names ready to show. */
export const shellState = (
  state: State,
  status: (key: TabKey) => TabStatus
): ShellState => {
  const profile = selectedProfile(state);

  return {
    profiles: {
      profiles: state.profiles.map((candidate) => ({
        id: candidate.id,
        name: profileDisplayName(candidate),
      })),
      selectedProfileId: state.selectedProfileId,
    },
    tabs: {
      profileId: profile.id,
      selectedTabId: profile.selectedTabId,
      tabs: knownTabs(profile).map((tab) => ({
        id: tab.id,
        app: tab.app,
        title: tab.title,
        closable: canCloseTab(tab),
        status: shellTabStatus(
          status({ profileId: profile.id, tabId: tab.id })
        ),
      })),
    },
  };
};

export const createShellHandlers = ({
  profiles,
  tabs,
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
    selectTab: async (key) => {
      await profiles.selectTab(key);
    },
    closeTab: async (key) => {
      await profiles.closeTab(key);
    },
    retryTab: (key) => {
      tabs.retry(key);

      return Promise.resolve();
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
