import { plural, t } from "@lingui/core/macro";

import {
  COMPOSE_HASH,
  SETTINGS_HASH,
  searchHash,
  searchQueryOf,
} from "#core/gmail-hash.ts";
import { DO_NOT_DISTURB_DURATIONS } from "#core/notification-gate.ts";
import type { DoNotDisturbDuration } from "#core/notification-gate.ts";
import type { Platform } from "#core/platform.ts";
import {
  canSaveSearch,
  savedSearchName,
  savedSearches,
} from "#core/saved-searches.ts";
import { adjacentProfile, knownTabs, selectedProfile } from "#core/state.ts";
import type { DoNotDisturb, State } from "#core/state.ts";
import { adjacentTab, canCloseTab, findTab } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";

/** What a command decides from: main's state as it is now. */
export interface CommandContext {
  state: State;
  /** Do Not Disturb while it holds, else `undefined`. */
  doNotDisturb: DoNotDisturb | undefined;
  /** Whether the unified inbox covers the content area. */
  inboxOpen: boolean;
  /** Whether the sidebar shows. */
  sidebarShown: boolean;
}

/** What commands do, each through the module that owns it. */
export interface CommandActions {
  reloadSelectedTab: () => void;
  selectTab: (key: TabKey) => Promise<unknown>;
  closeTab: (key: TabKey) => Promise<unknown>;
  selectProfile: (profileId: string) => Promise<unknown>;
  addProfile: () => Promise<unknown>;
  /** Opens the overlay with a field for the profile's name. */
  openRenameProfile: (profileId: string) => void;
  /** Switches Do Not Disturb on for the duration, or off. */
  switchDoNotDisturb: (choice: DoNotDisturbDuration | "off") => Promise<void>;
  /** Shows the unified inbox, or puts the tab back. */
  setInboxOpen: (open: boolean) => void;
  /** Shows the sidebar where it is hidden, else hides it. */
  toggleSidebar: () => void;
  /** Shows the profile's Gmail tab and sends its page to `hash`. */
  navigateGmail: (profileId: string, hash: string) => Promise<unknown>;
  /** Adds `query` to the profile's saved searches, if it can be saved. */
  saveSearch: (profileId: string, query: string) => Promise<unknown>;
  removeSavedSearch: (profileId: string, searchId: string) => Promise<unknown>;
}

export interface Command {
  id: string;
  /** Called each time the command is shown, so it is in the language of the day. */
  title: () => string;
  /** An Electron accelerator per platform; none where the platform has no key. */
  shortcut?: Partial<Record<Platform, string>>;
  isAvailable?: (context: CommandContext) => boolean;
  /** A command with this is a choice that is on or off. */
  isChecked?: (context: CommandContext) => boolean;
  /**
   * Runs once for a held shortcut, since repeating it would close or step
   * through more than the person meant.
   */
  once?: true;
  run: (context: CommandContext, actions: CommandActions) => Promise<unknown>;
}

const selectedTab = (state: State): TabKey => {
  const profile = selectedProfile(state);

  return { profileId: profile.id, tabId: profile.selectedTabId };
};

const selectAdjacentTab = (offset: number): Command["run"] => {
  const run: Command["run"] = async (
    { state },
    { selectTab, setInboxOpen }
  ) => {
    const key = adjacentTab(state, offset);

    if (key) {
      await selectTab(key);
      setInboxOpen(false);
    }
  };

  return run;
};

const selectAdjacentProfile = (offset: number): Command["run"] => {
  const run: Command["run"] = async (
    { state },
    { selectProfile, setInboxOpen }
  ) => {
    const profileId = adjacentProfile(state, offset);

    if (profileId !== undefined) {
      await selectProfile(profileId);
      setInboxOpen(false);
    }
  };

  return run;
};

/** The id of the command that switches Do Not Disturb on for `duration`. */
export const doNotDisturbCommandId = (duration: DoNotDisturbDuration) =>
  `doNotDisturb.${duration.id}`;

const durationTitle = (duration: DoNotDisturbDuration) => {
  switch (duration.id) {
    case "untilOff": {
      return t({
        message: "Until Turned Off",
        comment:
          "Item in the Do Not Disturb menu that holds notifications until the person turns Do Not Disturb off",
      });
    }
    case "untilTomorrow": {
      return t({
        message: "Until Tomorrow",
        comment:
          "Item in the Do Not Disturb menu that holds notifications until midnight tonight",
      });
    }
    default: {
      const { minutes } = duration;
      const hours = minutes / 60;

      return minutes < 60
        ? t({
            message: plural(minutes, {
              one: "For # Minute",
              other: "For # Minutes",
            }),
            comment:
              "Item in the Do Not Disturb menu that holds notifications for this many minutes",
          })
        : t({
            message: plural(hours, {
              one: "For # Hour",
              other: "For # Hours",
            }),
            comment:
              "Item in the Do Not Disturb menu that holds notifications for this many hours",
          });
    }
  }
};

const doNotDisturbHolds = ({ doNotDisturb }: CommandContext) =>
  doNotDisturb !== undefined;

const hasOtherTab = ({ state }: CommandContext) =>
  adjacentTab(state, 1) !== undefined;

const hasOtherProfile = ({ state }: CommandContext) =>
  adjacentProfile(state, 1) !== undefined;

/**
 * The query of the search the selected profile's Gmail tab shows while it is
 * the tab in front, as main last heard its URL.
 */
export const currentSearch = (state: State) => {
  const profile = selectedProfile(state);
  const tab = knownTabs(profile).find(
    (candidate) => candidate.id === profile.selectedTabId
  );

  return tab?.app === "gmail" ? searchQueryOf(tab.url) : undefined;
};

const navigateTo =
  (hash: string): Command["run"] =>
  ({ state }, { navigateGmail }) =>
    navigateGmail(state.selectedProfileId, hash);

/**
 * The selected profile's saved searches, as a command each that runs it and
 * one that removes it. Made from the state as it is, so the menu lists them
 * and the registry does not.
 */
export const savedSearchCommands = (state: State) =>
  savedSearches(state, state.selectedProfileId).map((search) => {
    const name = () => savedSearchName(search);

    return {
      open: {
        id: `savedSearch.open.${search.id}`,
        title: name,
        run: navigateTo(searchHash(search.query)),
      } satisfies Command,
      remove: {
        id: `savedSearch.remove.${search.id}`,
        title: name,
        run: ({ state: current }, { removeSavedSearch }) =>
          removeSavedSearch(current.selectedProfileId, search.id),
      } satisfies Command,
    };
  });

/**
 * Every command, declared once. The default shortcuts are v3's where v3 has
 * the command.
 */
export const COMMANDS: readonly Command[] = [
  {
    id: "sidebar.toggle",
    title: () =>
      t({
        message: "Sidebar",
        comment:
          "Menu item in the View menu, checked while the list of the profile's tabs shows down the left of the window",
      }),
    shortcut: {
      darwin: "CommandOrControl+S",
      win32: "CommandOrControl+S",
      linux: "CommandOrControl+S",
    },
    isChecked: ({ sidebarShown }) => sidebarShown,
    once: true,
    run: (_context, { toggleSidebar }) => {
      toggleSidebar();

      return Promise.resolve();
    },
  },
  {
    id: "inbox.toggle",
    title: () =>
      t({
        message: "Unified Inbox",
        comment:
          "Menu item in the View menu, checked while the list of every profile's unread mail fills the window in place of the tab",
      }),
    shortcut: {
      darwin: "CommandOrControl+Shift+I",
      win32: "CommandOrControl+Shift+I",
      linux: "CommandOrControl+Shift+I",
    },
    // Available while open too, so its key and item close it.
    isAvailable: ({ state, inboxOpen }) =>
      inboxOpen || state.profiles.length > 1,
    isChecked: ({ inboxOpen }) => inboxOpen,
    once: true,
    run: ({ inboxOpen }, { setInboxOpen }) => {
      setInboxOpen(!inboxOpen);

      return Promise.resolve();
    },
  },
  {
    id: "tab.reload",
    title: () =>
      t({
        message: "Reload",
        comment: "Menu item in the View menu that loads the selected tab again",
      }),
    shortcut: {
      darwin: "CommandOrControl+R",
      win32: "CommandOrControl+R",
      linux: "CommandOrControl+R",
    },
    run: (_context, { reloadSelectedTab }) => {
      reloadSelectedTab();

      return Promise.resolve();
    },
  },
  {
    id: "tab.next",
    title: () =>
      t({
        message: "Select Next Tab",
        comment:
          "Menu item in the Tabs menu that selects the tab below the selected one, or the first after the last",
      }),
    shortcut: { darwin: "Ctrl+Tab", win32: "Ctrl+Tab", linux: "Ctrl+Tab" },
    isAvailable: hasOtherTab,
    once: true,
    run: selectAdjacentTab(1),
  },
  {
    id: "tab.previous",
    title: () =>
      t({
        message: "Select Previous Tab",
        comment:
          "Menu item in the Tabs menu that selects the tab above the selected one, or the last before the first",
      }),
    shortcut: {
      darwin: "Ctrl+Shift+Tab",
      win32: "Ctrl+Shift+Tab",
      linux: "Ctrl+Shift+Tab",
    },
    isAvailable: hasOtherTab,
    once: true,
    run: selectAdjacentTab(-1),
  },
  {
    id: "tab.close",
    title: () =>
      t({
        message: "Close Tab",
        comment: "Menu item in the Tabs menu that closes the selected tab",
      }),
    shortcut: {
      darwin: "CommandOrControl+Shift+W",
      win32: "CommandOrControl+Shift+W",
      linux: "CommandOrControl+Shift+W",
    },
    isAvailable: ({ state }) => {
      const tab = findTab(state, selectedTab(state));

      return tab !== undefined && canCloseTab(tab);
    },
    once: true,
    run: ({ state }, { closeTab }) => closeTab(selectedTab(state)),
  },
  {
    id: "profile.next",
    title: () =>
      t({
        message: "Select Next Profile",
        comment:
          "Menu item in the Window menu that selects the profile right of the selected one, or the first after the last",
      }),
    shortcut: { darwin: "Command+Shift+]" },
    isAvailable: hasOtherProfile,
    once: true,
    run: selectAdjacentProfile(1),
  },
  {
    id: "profile.previous",
    title: () =>
      t({
        message: "Select Previous Profile",
        comment:
          "Menu item in the Window menu that selects the profile left of the selected one, or the last before the first",
      }),
    shortcut: { darwin: "Command+Shift+[" },
    isAvailable: hasOtherProfile,
    once: true,
    run: selectAdjacentProfile(-1),
  },
  {
    id: "profile.add",
    title: () =>
      t({
        message: "Add Profile",
        comment:
          "Menu item in the Window menu that adds a profile, signed in to no account yet, and selects it",
      }),
    once: true,
    run: async (_context, { addProfile, setInboxOpen }) => {
      await addProfile();
      setInboxOpen(false);
    },
  },
  {
    id: "profile.rename",
    title: () =>
      t({
        message: "Rename Profile…",
        comment:
          "Menu item in the Window menu that shows a field to change the selected profile's name",
      }),
    run: ({ state }, { openRenameProfile }) => {
      openRenameProfile(state.selectedProfileId);

      return Promise.resolve();
    },
  },
  {
    id: "gmail.compose",
    title: () =>
      t({
        message: "Compose",
        comment:
          "Menu item in the Mail menu that opens a new message in the selected profile's Gmail",
      }),
    run: navigateTo(COMPOSE_HASH),
  },
  {
    id: "gmail.settings",
    title: () =>
      t({
        message: "Gmail Settings",
        comment:
          "Menu item in the Mail menu that opens Gmail's own settings in the selected profile's Gmail tab",
      }),
    // v3's. Gmail's own keys use Ctrl with a comma, not with Shift too.
    shortcut: {
      darwin: "CommandOrControl+Shift+,",
      win32: "CommandOrControl+Shift+,",
      linux: "CommandOrControl+Shift+,",
    },
    run: navigateTo(SETTINGS_HASH),
  },
  {
    id: "savedSearch.save",
    title: () =>
      t({
        message: "Save Current Search",
        comment:
          "Menu item in the Saved Searches menu that keeps the search Gmail shows now, to run again later",
      }),
    isAvailable: ({ state }) => {
      const query = currentSearch(state);

      return (
        query !== undefined &&
        canSaveSearch(state, state.selectedProfileId, query)
      );
    },
    run: ({ state }, { saveSearch }) => {
      const query = currentSearch(state);

      return query === undefined
        ? Promise.resolve()
        : saveSearch(state.selectedProfileId, query);
    },
  },
  {
    id: "doNotDisturb.toggle",
    title: () =>
      t({
        message: "Do Not Disturb",
        comment:
          "Command that turns Do Not Disturb on until turned off, or off, checked while it holds new mail notifications",
      }),
    isChecked: doNotDisturbHolds,
    run: (context, { switchDoNotDisturb }) =>
      switchDoNotDisturb(
        doNotDisturbHolds(context) ? "off" : DO_NOT_DISTURB_DURATIONS[0]
      ),
  },
  {
    id: "doNotDisturb.off",
    title: () =>
      t({
        message: "Turn Off",
        comment:
          "Item in the Do Not Disturb menu that turns Do Not Disturb off, so notifications show again",
      }),
    isAvailable: doNotDisturbHolds,
    run: (_context, { switchDoNotDisturb }) => switchDoNotDisturb("off"),
  },
  ...DO_NOT_DISTURB_DURATIONS.map((duration): Command => ({
    id: doNotDisturbCommandId(duration),
    title: () => durationTitle(duration),
    run: (_context, { switchDoNotDisturb }) => switchDoNotDisturb(duration),
  })),
];
