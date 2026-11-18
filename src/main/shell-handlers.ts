import type { ShellState } from "#contract/shell.ts";
import { ariaKeyShortcut, formatAccelerator } from "#core/accelerator.ts";
import { findApp } from "#core/apps.ts";
import type { App } from "#core/apps.ts";
import { openableApps, splittableApps } from "#core/open-app.ts";
import type { Overlay } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import { profileColor } from "#core/profile-color.ts";
import { profileMenuItems } from "#core/profile-menu.ts";
import { boxOrder, isMaximized, splitRoomy } from "#core/split.ts";
import { isAsleep, isPinned, knownTabs, selectedProfile } from "#core/state.ts";
import type { DoNotDisturb, State } from "#core/state.ts";
import type { TabStatus } from "#core/tab-machine.ts";
import { tabMenuItems } from "#core/tab-menu.ts";
import { findTab, splitOntoTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import { viewDrop } from "#core/view-drop.ts";
import type { Size } from "#core/window-bounds.ts";
import type { AppWindow, ContextMenuItem } from "#platform/window.ts";

import type { Command } from "./commands.ts";
import type { Focus } from "./focus.ts";
import type { Inbox } from "./inbox.ts";
import type { Mail } from "./mail.ts";
import type { OpenApp } from "./open-app.ts";
import type { Overlays } from "./overlay.ts";
import type { PaneResizer } from "./pane-resize.ts";
import { profileDisplayName } from "./profile-copy.ts";
import type { ProfileMenu } from "./profile-menu.ts";
import type { Profiles } from "./profiles.ts";
import type { ShellHandlers } from "./shell-ipc.ts";
import type { Sidebar } from "./sidebar.ts";
import type { TabMenu } from "./tab-menu.ts";

export interface ShellHandlersDeps {
  profiles: Pick<
    Profiles,
    | "get"
    | "select"
    | "rename"
    | "closeTab"
    | "moveTab"
    | "moveInBox"
    | "splitOntoTab"
    | "dropInView"
    | "maximizePane"
  >;
  /** The page area's size, which a split's panes must fit. */
  pageSize: () => Size;
  overlays: Pick<Overlays, "open" | "close" | "current">;
  /** Selecting a tab through them wakes it if it sleeps. */
  tabs: {
    retry: (key: TabKey) => void;
    select: (key: TabKey) => Promise<unknown>;
  };
  inbox: Pick<Inbox, "setOpen" | "openMessage" | "runAction">;
  openApp: Pick<OpenApp, "choose">;
  tabMenu: Pick<TabMenu, "open" | "run">;
  panes: Pick<PaneResizer, "resize" | "evenOut">;
  profileMenu: Pick<ProfileMenu, "open" | "run">;
  /** Selects the profile's Gmail as the tray's profile item does. */
  openGmail: (profileId: string) => Promise<unknown>;
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

const shellTabMenu = (
  state: State,
  overlay: Extract<Overlay, { kind: "tab-menu" }>,
  status: (key: TabKey) => TabStatus,
  apps: readonly App[]
): ShellState["overlay"] => {
  const { profileId, tabId, x, y } = overlay;
  const tab = findTab(state, overlay);
  const items =
    tab &&
    tabMenuItems(state, overlay, apps, status(overlay).kind !== "unloaded");

  return tab && items
    ? {
        kind: "tab-menu",
        profileId,
        tabId,
        x,
        y,
        title: tab.title || (findApp(apps, tab.app)?.name ?? tab.app),
        pinned: isPinned(tab),
        items,
      }
    : { kind: "none" };
};

const shellOverlay = (
  state: State,
  overlay: Overlay | undefined,
  status: (key: TabKey) => TabStatus,
  apps: readonly App[]
): ShellState["overlay"] => {
  if (overlay?.kind === "inbox") {
    return { kind: "inbox" };
  }

  if (overlay?.kind === "tab-menu") {
    return shellTabMenu(state, overlay, status, apps);
  }

  if (overlay?.kind === "toast") {
    return { kind: "toast", message: overlay.message };
  }

  if (overlay?.kind === "drop") {
    return {
      kind: "drop",
      ...overlay.zone,
      along: overlay.along,
      fits: overlay.fits,
    };
  }

  const profile =
    overlay &&
    state.profiles.find((candidate) => candidate.id === overlay.profileId);

  if (!overlay || !profile) {
    return { kind: "none" };
  }

  if (overlay.kind === "profile-menu") {
    return {
      kind: "profile-menu",
      profileId: profile.id,
      x: overlay.x,
      y: overlay.y,
      title: profileDisplayName(profile),
      items: profileMenuItems(state, profile.id) ?? [],
    };
  }

  return overlay.kind === "open-app"
    ? {
        kind: "open-app",
        profileId: profile.id,
        apps: (overlay.split
          ? splittableApps(apps, profile)
          : openableApps(apps, profile)
        ).map(({ id, name }) => ({ id, name })),
        split: overlay.split ?? null,
      }
    : {
        kind: "rename-profile",
        profileId: profile.id,
        name: profileDisplayName(profile),
      };
};

/**
 * The registry's shortcuts as the shell shows them, or with `aria` as
 * `aria-keyshortcuts` names them, by command id.
 */
export const shellShortcuts = (
  commands: readonly Pick<Command, "id" | "shortcut">[],
  platform: Platform,
  aria = false
): ShellState["shortcuts"] =>
  Object.fromEntries(
    commands.flatMap(({ id, shortcut }) => {
      const accelerator = shortcut?.[platform];

      return accelerator
        ? [
            [
              id,
              aria
                ? ariaKeyShortcut(accelerator, platform)
                : formatAccelerator(accelerator, platform),
            ],
          ]
        : [];
    })
  );

/** The slices the shell sees of main's state, names ready to show. */
export const shellState = (
  state: State,
  status: (key: TabKey) => TabStatus,
  page: {
    /** Whether the selected tab was put to sleep, and so has no page. */
    selectedAsleep: boolean;
    panes: ShellState["tabs"]["panes"];
    handles: ShellState["tabs"]["handles"];
  },
  overlay: Overlay | undefined,
  mail: (profileId: string) => Mail,
  doNotDisturb: DoNotDisturb | undefined,
  inbox: ShellState["inbox"],
  fixed: Pick<
    ShellState,
    "sidebar" | "shortcuts" | "ariaShortcuts" | "navigation"
  >,
  /** The registry, or the suite's stand-ins for it, which Open app lists. */
  apps: readonly App[]
): ShellState => {
  const profile = selectedProfile(state);

  return {
    profiles: {
      profiles: state.profiles.map((candidate) => ({
        id: candidate.id,
        name: profileDisplayName(candidate),
        color: profileColor(state, candidate.id),
        mail: mail(candidate.id),
        asleep: isAsleep(state, candidate),
      })),
      selectedProfileId: state.selectedProfileId,
    },
    tabs: {
      profileId: profile.id,
      selectedTabId: profile.selectedTabId,
      selectedAsleep: page.selectedAsleep,
      tabs: knownTabs(profile).map((tab) => ({
        id: tab.id,
        app: tab.app,
        title: tab.title,
        pinned: isPinned(tab),
        status: shellTabStatus(
          status({ profileId: profile.id, tabId: tab.id })
        ),
      })),
      panes: page.panes,
      handles: page.handles,
      box: boxOrder(profile) ?? null,
      maximized: isMaximized(profile),
    },
    doNotDisturb: {
      on: doNotDisturb !== undefined,
      until: doNotDisturb?.until ?? null,
    },
    overlay: shellOverlay(state, overlay, status, apps),
    inbox,
    ...fixed,
  };
};

export const createShellHandlers = ({
  profiles,
  overlays,
  tabs,
  inbox,
  openApp,
  tabMenu,
  panes,
  pageSize,
  profileMenu,
  openGmail,
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
  selectTab: async (key) => {
    await tabs.select(key);
    inbox.setOpen(false);
  },
  moveTab: async ({ profileId, tabId, before }) => {
    if (profileId === profiles.get().selectedProfileId) {
      await profiles.moveTab({ profileId, tabId }, before);
    } else {
      log(
        `Refused to move tab ${profileId}/${tabId} of a profile not selected`
      );
    }
  },
  moveInBox: async ({ profileId, tabId, before }) => {
    if (profileId === profiles.get().selectedProfileId) {
      await profiles.moveInBox({ profileId, tabId }, before);
    } else {
      log(
        `Refused to move tab ${profileId}/${tabId} of a profile not selected`
      );
    }
  },
  aimTab: ({ profileId, tabId, point }) => {
    const state = profiles.get();
    const drop =
      point && profileId === state.selectedProfileId
        ? viewDrop(selectedProfile(state), pageSize(), point, tabId)
        : undefined;

    if (drop) {
      overlays.open({
        kind: "drop",
        zone: drop.zone,
        along: drop.kind,
        fits: drop.fits,
      });
    } else if (overlays.current()?.kind === "drop") {
      overlays.close();
    }

    return Promise.resolve();
  },
  dropTab: async ({ profileId, tabId, x, y }) => {
    if (overlays.current()?.kind === "drop") {
      overlays.close();
    }

    if (profileId === profiles.get().selectedProfileId) {
      await profiles.dropInView({ profileId, tabId }, pageSize(), { x, y });
    } else {
      log(
        `Refused to drop tab ${profileId}/${tabId} of a profile not selected`
      );
    }
  },
  splitOntoTab: async ({ profileId, tabId, target }) => {
    const state = profiles.get();

    if (profileId !== state.selectedProfileId) {
      log(
        `Refused to split tab ${profileId}/${tabId} of a profile not selected`
      );

      return;
    }

    const next = splitOntoTab(state, { profileId, tabId }, target);

    if (next && !splitRoomy(selectedProfile(next), pageSize())) {
      overlays.open({ kind: "toast", message: "no-room" });

      return;
    }

    await profiles.splitOntoTab({ profileId, tabId }, target);
  },
  closeTab: async (key) => {
    await profiles.closeTab(key);

    // The sidebar, and the tab that had focus in it, is gone.
    if (sidebar.current() === "hidden") {
      focus.focus([{ kind: "front" }, { kind: "shell" }]);
    }
  },
  resizePanes: async (request) => {
    await panes.resize(request);
  },
  evenOutPanes: async (request) => {
    await panes.evenOut(request);
  },
  maximizePane: async ({ profileId, tabId, on }) => {
    await profiles.maximizePane({ profileId, tabId }, on);
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
  toggleOpenApp: () => {
    runCommand("app.open");

    return Promise.resolve();
  },
  openApp: async ({ appId }) => {
    await openApp.choose(appId);
  },
  openGmail: async ({ profileId }) => {
    await openGmail(profileId);
  },
  openTabMenu: (request) => {
    tabMenu.open(request);

    return Promise.resolve();
  },
  runTabMenuItem: async ({ item }) => {
    await tabMenu.run(item);
  },
  openProfileMenu: (request) => {
    profileMenu.open(request);

    return Promise.resolve();
  },
  runProfileMenuItem: async ({ item }) => {
    await profileMenu.run(item);
  },
});
