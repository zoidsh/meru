import type { ShellState } from "#contract/shell.ts";
import { formatAccelerator } from "#core/accelerator.ts";
import type { Overlay } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import { profileColor } from "#core/profile-color.ts";
import { knownTabs, selectedProfile } from "#core/state.ts";
import type { DoNotDisturb, State } from "#core/state.ts";
import type { TabStatus } from "#core/tab-machine.ts";
import { canCloseTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { AppWindow, ContextMenuItem } from "#platform/window.ts";

import type { Command } from "./commands.ts";
import type { Focus } from "./focus.ts";
import type { Inbox } from "./inbox.ts";
import type { Mail } from "./mail.ts";
import type { Overlays } from "./overlay.ts";
import { profileDisplayName } from "./profile-copy.ts";
import type { Profiles } from "./profiles.ts";
import type { ShellHandlers } from "./shell-ipc.ts";
import type { Sidebar } from "./sidebar.ts";

export interface ShellHandlersDeps {
  profiles: Pick<
    Profiles,
    "get" | "select" | "add" | "rename" | "selectTab" | "closeTab"
  >;
  overlays: Pick<Overlays, "open" | "close" | "current">;
  tabs: { retry: (key: TabKey) => void };
  inbox: Pick<Inbox, "setOpen" | "openMessage" | "runAction">;
  window: Pick<AppWindow, "showContextMenu">;
  sidebar: Pick<Sidebar, "current" | "toggleWidth">;
  focus: Pick<Focus, "focus">;
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

/** The registry's shortcuts as the shell shows them, by command id. */
export const shellShortcuts = (
  commands: readonly Pick<Command, "id" | "shortcut">[],
  platform: Platform
): ShellState["shortcuts"] =>
  Object.fromEntries(
    commands.flatMap(({ id, shortcut }) => {
      const accelerator = shortcut?.[platform];

      return accelerator
        ? [[id, formatAccelerator(accelerator, platform)]]
        : [];
    })
  );

/** The slices the shell sees of main's state, names ready to show. */
export const shellState = (
  state: State,
  status: (key: TabKey) => TabStatus,
  overlay: Overlay | undefined,
  mail: (profileId: string) => Mail,
  doNotDisturb: DoNotDisturb | undefined,
  inbox: ShellState["inbox"],
  fixed: Pick<ShellState, "sidebar" | "shortcuts" | "navigation">
): ShellState => {
  const profile = selectedProfile(state);

  return {
    profiles: {
      profiles: state.profiles.map((candidate) => ({
        id: candidate.id,
        name: profileDisplayName(candidate),
        color: profileColor(state, candidate.id),
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
    doNotDisturb: {
      on: doNotDisturb !== undefined,
      until: doNotDisturb?.until ?? null,
    },
    overlay: shellOverlay(state, overlay),
    inbox,
    ...fixed,
  };
};

export const createShellHandlers = ({
  profiles,
  overlays,
  tabs,
  inbox,
  window,
  sidebar,
  focus,
  runCommand,
  doNotDisturbItems,
  log,
}: ShellHandlersDeps): ShellHandlers => ({
  // Each that selects closes the unified inbox, even when what it asks for
  // is selected already, since the person asked to see it.
  selectProfile: async ({ profileId }) => {
    await profiles.select(profileId);
    inbox.setOpen(false);
  },
  addProfile: async () => {
    await profiles.add();
    inbox.setOpen(false);
  },
  selectTab: async (key) => {
    await profiles.selectTab(key);
    inbox.setOpen(false);
  },
  closeTab: async (key) => {
    await profiles.closeTab(key);

    // The sidebar, and the tab that had focus in it, is gone.
    if (sidebar.current() === "hidden") {
      focus.focus([{ kind: "front" }]);
    }
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
  toggleSidebar: () => {
    runCommand("sidebar.toggle");

    return Promise.resolve();
  },
  navigate: ({ action }) => {
    runCommand(`tab.${action}`);

    return Promise.resolve();
  },
  toggleSidebarWidth: () => {
    sidebar.toggleWidth();

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
  setInboxOpen: ({ open }) => {
    inbox.setOpen(open);

    return Promise.resolve();
  },
  openInboxMessage: async ({ profileId, messageId }) => {
    await inbox.openMessage(profileId, messageId);
  },
  runInboxAction: async ({ profileId, messageId, action }) => {
    await inbox.runAction(profileId, messageId, action);
  },
});
