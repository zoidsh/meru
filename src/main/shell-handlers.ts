import type { ShellState } from "#contract/shell.ts";
import type { Overlay } from "#core/overlay.ts";
import type { SettingKey, SettingValue } from "#core/settings.ts";
import { canRemoveProfile, knownTabs, selectedProfile } from "#core/state.ts";
import type { DoNotDisturb, State } from "#core/state.ts";
import type { TabStatus } from "#core/tab-machine.ts";
import { canCloseTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { AppWindow, ContextMenuItem } from "#platform/window.ts";

import type { Mail } from "./mail.ts";
import type { Overlays } from "./overlay.ts";
import {
  profileDisplayName,
  removeProfileConfirmation,
  removeProfileMenuLabel,
  renameProfileMenuLabel,
} from "./profile-copy.ts";
import type { Profiles } from "./profiles.ts";
import type { ShellHandlers } from "./shell-ipc.ts";

export interface ShellHandlersDeps {
  profiles: Pick<
    Profiles,
    "get" | "select" | "add" | "remove" | "rename" | "selectTab" | "closeTab"
  >;
  overlays: Pick<Overlays, "open" | "close" | "current">;
  tabs: { retry: (key: TabKey) => void };
  window: Pick<AppWindow, "showContextMenu" | "confirm">;
  /** Runs a command of the registry, as its menu item would. */
  runCommand: (id: string) => void;
  /** The Do Not Disturb menu as the application menu has it now. */
  doNotDisturbItems: () => ContextMenuItem[];
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

/** The settings the shell draws by; vibrancy is macOS's alone. */
export const shellSettings = (
  get: <Key extends SettingKey>(key: Key) => SettingValue<Key>,
  isMacOS: boolean
): ShellState["settings"] => ({
  design: get("design"),
  vibrancy: isMacOS && get("vibrancy"),
});

const shellOverlay = (
  state: State,
  overlay: Overlay | undefined
): ShellState["overlay"] => {
  const profile =
    overlay &&
    state.profiles.find((candidate) => candidate.id === overlay.profileId);

  return overlay && profile
    ? {
        kind: "rename-profile",
        profileId: profile.id,
        name: profileDisplayName(profile),
      }
    : { kind: "none" };
};

/** The slices the shell sees of main's state, names ready to show. */
export const shellState = (
  state: State,
  status: (key: TabKey) => TabStatus,
  settings: ShellState["settings"],
  overlay: Overlay | undefined,
  mail: (profileId: string) => Mail,
  doNotDisturb: DoNotDisturb | undefined
): ShellState => {
  const profile = selectedProfile(state);

  return {
    profiles: {
      profiles: state.profiles.map((candidate) => ({
        id: candidate.id,
        name: profileDisplayName(candidate),
        mail: mail(candidate.id),
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
    settings,
    doNotDisturb: {
      on: doNotDisturb !== undefined,
      until: doNotDisturb?.until ?? null,
    },
    overlay: shellOverlay(state, overlay),
  };
};

export const createShellHandlers = ({
  profiles,
  overlays,
  tabs,
  window,
  runCommand,
  doNotDisturbItems,
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
    renameProfile: async ({ profileId, name }) => {
      const open = overlays.current();
      const profile = profiles
        .get()
        .profiles.find((candidate) => candidate.id === profileId);

      if (open?.kind !== "rename-profile" || open.profileId !== profileId) {
        log(`Refused to rename profile ${profileId}, whose rename is not open`);

        return;
      }

      try {
        // The field starts with the name as shown, which for the first
        // profile is "Default" translated; left so, it stays in English.
        if (profile && name.trim() !== profileDisplayName(profile)) {
          await profiles.rename(profileId, name);
        }
      } finally {
        overlays.close();
      }
    },
    closeOverlay: () => {
      overlays.close();

      return Promise.resolve();
    },
    toggleDoNotDisturb: () => {
      runCommand("doNotDisturb.toggle");

      return Promise.resolve();
    },
    openDoNotDisturbMenu: () => {
      window.showContextMenu(doNotDisturbItems());

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
            label: renameProfileMenuLabel(),
            enabled: true,
            click: () => {
              overlays.open({ kind: "rename-profile", profileId });
            },
          },
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
