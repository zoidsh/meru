import { plural, t } from "@lingui/core/macro";

import { APPS, findApp } from "#core/apps.ts";
import { drawnTabs } from "#core/drawn-tabs.ts";
import type { Capability } from "#core/entitlement.ts";
import {
  COMPOSE_HASH,
  SETTINGS_HASH,
  searchHash,
  searchQueryOf,
} from "#core/gmail-hash.ts";
import {
  DO_NOT_DISTURB_DURATIONS,
  DO_NOT_DISTURB_MORNING_HOUR,
  UNTIL_OFF,
} from "#core/notification-gate.ts";
import type { DoNotDisturbDuration } from "#core/notification-gate.ts";
import type { PaneDirection } from "#core/pane-tree.ts";
import {
  PINNED_SHORTCUT_COUNT,
  selectPinnedCommandId,
} from "#core/pinned-tabs.ts";
import type { Platform } from "#core/platform.ts";
import {
  PROFILE_SHORTCUT_COUNT,
  selectProfileCommandId,
} from "#core/profile-shortcuts.ts";
import {
  savedSearchName,
  savedSearchRefusal,
  savedSearches,
} from "#core/saved-searches.ts";
import {
  isInSplit,
  isMaximized,
  splitPanes,
  splitTarget,
} from "#core/split.ts";
import {
  adjacentProfile,
  enabledProfiles,
  canSleepProfile,
  isPinned,
  knownTabs,
  opensAtLaunch,
  selectedProfile,
} from "#core/state.ts";
import type { DoNotDisturb, State } from "#core/state.ts";
import {
  adjacentTab,
  canCloseTab,
  canMoveToOwnWindow,
  findTab,
} from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import { i18n } from "#i18n/index.ts";
import type { Navigation } from "#platform/content-view.ts";

import { MENU_LABELS } from "./menu-labels.ts";

/** What a command decides from: main's state as it is now. */
export interface CommandContext {
  state: State;
  /**
   * The tab whose own window has focus, whose page the commands that run
   * there act on; `undefined` while the main window has it.
   */
  ownWindow: TabKey | undefined;
  /**
   * Whether the Settings window has focus. It has no page, so the page's
   * fields read as `NO_PAGE`, and only what runs in a tab's own window and
   * needs no tab is offered, Back and Forward stepping its own history.
   */
  settingsFocused: boolean;
  /** While the Settings window has focus, where its history can step; else `undefined`. */
  settingsHistory: { canGoBack: boolean; canGoForward: boolean } | undefined;
  /** Do Not Disturb while it holds, else `undefined`. */
  doNotDisturb: DoNotDisturb | undefined;
  /** What this run may use, the entitlement's `can`. */
  can: (capability: Capability) => boolean;
  /** Whether this build updates itself. */
  canUpdate: boolean;
  /** Whether the unified inbox is open over the page. */
  inboxOpen: boolean;
  /** Whether the Downloads card is open over the page. */
  downloadsOpen: boolean;
  /** Whether New tab, the launcher, is open over the page. */
  openAppOpen: boolean;
  /** Whether the sidebar shows. */
  sidebarShown: boolean;
  /**
   * The page of the tab whose own window has focus, else the front tab's,
   * or `null` with none.
   */
  navigation: Navigation | null;
  /** Whether the selected tab was put to sleep, and so has no page. */
  selectedTabAsleep: boolean;
  /**
   * Whether the page Find would search shows: the page of the tab whose own
   * window has focus, else the front tab's with no card or menu over it.
   */
  findable: boolean;
  /** Whether Find Next and Previous have a term to go on with on that page. */
  canFindAgain: boolean;
  /**
   * Whether the page Bookmark Tab acts on is bookmarked: the page of the tab
   * whose own window has focus, else the selected tab's, the focused pane's
   * in a split, with no card or menu over it. `undefined` while it cannot be
   * bookmarked, as a Gmail, sleeping, loading or failed page.
   */
  bookmarked: boolean | undefined;
}

/** What commands do, each through the module that owns it. */
export interface CommandActions {
  /** Each of these four acts on the page `navigation` is. */
  reloadSelectedTab: () => void;
  goBack: () => void;
  goForward: () => void;
  stopLoading: () => void;
  /** Moves the tab to a window of its own. */
  moveToOwnWindow: (key: TabKey) => Promise<unknown>;
  /** Puts the tab back in the main window, selected. */
  moveToMainWindow: (key: TabKey) => Promise<unknown>;
  /** Selects the tab, waking it if it sleeps. */
  selectTab: (key: TabKey) => Promise<unknown>;
  sleepTab: (key: TabKey) => void;
  closeTab: (key: TabKey) => Promise<unknown>;
  setTabPinned: (key: TabKey, pinned: boolean) => Promise<unknown>;
  setTabOpenAtLaunch: (key: TabKey, on: boolean) => Promise<unknown>;
  /** Selects the profile, waking it if it sleeps. */
  selectProfile: (profileId: string) => Promise<unknown>;
  sleepProfile: (profileId: string) => Promise<unknown>;
  /** Switches Do Not Disturb on for the duration, or off. */
  switchDoNotDisturb: (choice: DoNotDisturbDuration | "off") => Promise<void>;
  /** Shows the unified inbox, or puts the tab back. */
  setInboxOpen: (open: boolean) => void;
  /** Opens the Downloads card, in the tab's own window `window` names if any, or closes it. */
  setDownloadsOpen: (open: boolean, window?: TabKey) => void;
  /** Opens New tab over the selected profile's page, or closes it. */
  setOpenAppOpen: (open: boolean) => void;
  /**
   * Opens Open in split, whose pick goes in a new pane that way of the
   * focused one, or says there is no room.
   */
  openSplit: (direction: PaneDirection) => void;
  /** Takes the tab out of its split; it stays selected and shows alone. */
  separateTab: (key: TabKey) => Promise<unknown>;
  /** Shows the tab's pane alone, selected, the split kept, or every pane again. */
  maximizePane: (key: TabKey, on: boolean) => Promise<unknown>;
  /** Shows the sidebar where it is hidden, else hides it. */
  toggleSidebar: () => void;
  /** Shows the profile's Gmail tab and sends its page to `hash`. */
  navigateGmail: (profileId: string, hash: string) => Promise<unknown>;
  /** Adds `query` to the profile's saved searches, if it can be saved. */
  addSavedSearch: (profileId: string, query: string) => Promise<unknown>;
  removeSavedSearch: (profileId: string, searchId: string) => Promise<unknown>;
  /**
   * Opens the find bar over the front tab's page, or over the page of the
   * tab in its own window `key` names, in that window; or focuses it.
   */
  openFind: (key?: TabKey) => void;
  /** Goes to the next or previous match, opening the bar if it is closed. */
  findAgain: (forward: boolean, key?: TabKey) => void;
  /**
   * Bookmark Tab or Remove Bookmark on the tab's page; with `announce`, a
   * toast says which.
   */
  toggleBookmark: (key: TabKey, announce: boolean) => Promise<unknown>;
  /** Opens the Settings window, or brings the open one forward. */
  openSettings: () => void;
  /** Opens the Settings window on About and checks for a new version there. */
  checkForUpdates: () => void;
}

export interface Command {
  id: string;
  /** Called each time the command is shown, so it is in the language of the day. */
  title: () => string;
  /** Its menu item's label where it follows the state, else the title. */
  label?: (context: CommandContext) => string;
  /** An Electron accelerator per platform; none where the platform has no key. */
  shortcut?: Partial<Record<Platform, string>>;
  isAvailable?: (context: CommandContext) => boolean;
  /**
   * What it needs of Meru Pro: while refused it is unavailable, and its menu
   * item says Pro.
   */
  capability?: Capability;
  /** A command with this is a choice that is on or off. */
  isChecked?: (context: CommandContext) => boolean;
  /**
   * Runs once for a held shortcut, since repeating it would close or step
   * through more than the person meant.
   */
  once?: true;
  /**
   * Runs while a tab's own window has focus, on its page; every other
   * command is the main window's and unavailable then.
   */
  inOwnWindow?: true;
  run: (context: CommandContext, actions: CommandActions) => Promise<unknown>;
}

/** The page's fields of a context whose focused window has no page. */
export const NO_PAGE = {
  navigation: null,
  selectedTabAsleep: false,
  findable: false,
  canFindAgain: false,
  bookmarked: undefined,
} as const satisfies Partial<CommandContext>;

/** Whether the command can run now, in the window that has focus. */
export const isCommandAvailable = (
  command: Pick<Command, "isAvailable" | "inOwnWindow" | "capability">,
  context: CommandContext
) =>
  !needsPro(command, context) &&
  (command.inOwnWindow === true ||
    (context.ownWindow === undefined && !context.settingsFocused)) &&
  (command.isAvailable?.(context) ?? true);

/** Whether the command is unavailable for the Meru Pro it needs. */
export const needsPro = (
  command: Pick<Command, "capability">,
  context: Pick<CommandContext, "can">
) => command.capability !== undefined && !context.can(command.capability);

const selectedTab = (state: State): TabKey => {
  const profile = selectedProfile(state);

  return { profileId: profile.id, tabId: profile.selectedTabId };
};

/** The tab in the window that has focus: its own window's, else the selected one. */
const actingTab = ({ state, ownWindow }: CommandContext): TabKey =>
  ownWindow ?? selectedTab(state);

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
      const time = new Intl.DateTimeFormat(i18n.locale, {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(2000, 0, 1, DO_NOT_DISTURB_MORNING_HOUR));

      return t({
        message: `Until Tomorrow, ${time}`,
        comment:
          "Item in the Do Not Disturb menu that holds notifications until the next morning; {time} is the time of day it ends, such as 8:00",
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
 * Every command, declared once. No default shortcut takes a key a Google
 * app uses on its platform, which `commands.test.ts` checks against
 * `#core/google-app-keys.ts`.
 */
export const COMMANDS: readonly Command[] = [
  {
    id: "app.settings",
    inOwnWindow: true,
    title: () =>
      t({
        message: "Settings…",
        comment: "Menu item in the app menu that opens the Settings window",
      }),
    shortcut: {
      darwin: "Command+,",
      win32: "Control+,",
      linux: "Control+,",
    },
    once: true,
    run: (_context, { openSettings }) => {
      openSettings();

      return Promise.resolve();
    },
  },
  {
    id: "app.checkForUpdates",
    inOwnWindow: true,
    title: () =>
      t({
        message: "Check for Updates…",
        comment:
          "Menu item in the app menu that opens the About page of Settings and checks for a new version of Meru there",
      }),
    isAvailable: ({ canUpdate }) => canUpdate,
    once: true,
    run: (_context, { checkForUpdates }) => {
      checkForUpdates();

      return Promise.resolve();
    },
  },
  {
    id: "sidebar.toggle",
    capability: "workspaceApps",
    title: () =>
      t({
        message: "Sidebar",
        context: "View menu",
        comment:
          "Menu item in the View menu, checked while the list of the profile's tabs shows down the left of the window",
      }),
    // Free in every Google app on each platform: Cmd or Ctrl+S is Save in
    // Docs, Sheets and Slides, and Ctrl+Cmd+S and Ctrl+Alt+S are Meet's and
    // Drive's. The letters differ because Ctrl+Cmd+D is macOS's Look Up, and
    // Ctrl+Alt+L is taken on Windows by Drive.
    shortcut: {
      darwin: "Control+Command+L",
      win32: "Control+Alt+D",
      linux: "Control+Alt+D",
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
          "Menu item in the View menu, checked while the list of every profile's unread mail is open over the page",
      }),
    shortcut: {
      darwin: "CommandOrControl+Shift+I",
      win32: "CommandOrControl+Shift+I",
      linux: "CommandOrControl+Shift+I",
    },
    capability: "unifiedInbox",
    // Available while open too, so its key and item close it.
    isAvailable: ({ state, inboxOpen }) =>
      inboxOpen || enabledProfiles(state).length > 1,
    isChecked: ({ inboxOpen }) => inboxOpen,
    once: true,
    run: ({ inboxOpen }, { setInboxOpen }) => {
      setInboxOpen(!inboxOpen);

      return Promise.resolve();
    },
  },
  {
    id: "downloads.toggle",
    title: () =>
      t({
        message: "Downloads",
        comment:
          "Menu item in the View menu, checked while the list of downloaded files is open over the page",
      }),
    shortcut: {
      darwin: "Control+Shift+J",
      win32: "Alt+Shift+J",
      linux: "Alt+Shift+J",
    },
    isChecked: ({ downloadsOpen }) => downloadsOpen,
    once: true,
    // In the window that holds the keys, a tab's own one included.
    run: ({ downloadsOpen, ownWindow }, { setDownloadsOpen }) => {
      setDownloadsOpen(!downloadsOpen, ownWindow);

      return Promise.resolve();
    },
  },
  {
    id: "tab.reload",
    inOwnWindow: true,
    title: () => MENU_LABELS.reload(),
    shortcut: {
      darwin: "Control+Shift+R",
      win32: "F5",
      linux: "F5",
    },
    // A sleeping tab has no page, and Reload wakes it.
    isAvailable: ({ navigation, selectedTabAsleep }) =>
      navigation !== null || selectedTabAsleep,
    run: (_context, { reloadSelectedTab }) => {
      reloadSelectedTab();

      return Promise.resolve();
    },
  },
  {
    id: "tab.back",
    inOwnWindow: true,
    title: () =>
      t({
        message: "Back",
        comment:
          "Menu item in the View menu that goes to the page the selected tab showed before",
      }),
    shortcut: {
      darwin: "Control+Command+[",
      win32: "Control+Alt+Left",
      linux: "Control+Alt+Left",
    },
    isAvailable: ({ navigation, settingsHistory }) =>
      (settingsHistory ?? navigation)?.canGoBack ?? false,
    run: (_context, { goBack }) => {
      goBack();

      return Promise.resolve();
    },
  },
  {
    id: "tab.forward",
    inOwnWindow: true,
    title: () =>
      t({
        message: "Forward",
        comment:
          "Menu item in the View menu that goes to the page the selected tab left by going back",
      }),
    shortcut: {
      darwin: "Control+Command+]",
      win32: "Control+Alt+Right",
      linux: "Control+Alt+Right",
    },
    isAvailable: ({ navigation, settingsHistory }) =>
      (settingsHistory ?? navigation)?.canGoForward ?? false,
    run: (_context, { goForward }) => {
      goForward();

      return Promise.resolve();
    },
  },
  {
    id: "tab.stop",
    inOwnWindow: true,
    title: () =>
      t({
        message: "Stop",
        comment:
          "Menu item in the View menu that stops the selected tab's page loading",
      }),
    isAvailable: ({ navigation }) => navigation?.loading ?? false,
    run: (_context, { stopLoading }) => {
      stopLoading();

      return Promise.resolve();
    },
  },
  {
    id: "tab.find",
    inOwnWindow: true,
    title: () =>
      t({
        message: "Find…",
        comment:
          "Menu item in the Edit menu that opens a small bar over the page to search its text",
      }),
    shortcut: {
      darwin: "Control+Shift+Command+F",
      win32: "F3",
      linux: "F3",
    },
    // Unavailable, the key reaches the page or the card over it.
    isAvailable: ({ findable }) => findable,
    run: ({ ownWindow }, { openFind }) => {
      openFind(ownWindow);

      return Promise.resolve();
    },
  },
  {
    id: "tab.findNext",
    inOwnWindow: true,
    title: () =>
      t({
        message: "Find Next",
        comment:
          "Menu item in the Edit menu that goes to the next match of the text searched for in the page",
      }),
    shortcut: {
      darwin: "Control+Command+G",
      win32: "Control+F3",
      linux: "Control+F3",
    },
    isAvailable: ({ findable, canFindAgain }) => findable && canFindAgain,
    run: ({ ownWindow }, { findAgain }) => {
      findAgain(true, ownWindow);

      return Promise.resolve();
    },
  },
  {
    id: "tab.findPrevious",
    inOwnWindow: true,
    title: () =>
      t({
        message: "Find Previous",
        comment:
          "Menu item in the Edit menu that goes to the previous match of the text searched for in the page",
      }),
    shortcut: {
      darwin: "Control+Shift+Command+G",
      win32: "Control+Shift+F3",
      linux: "Control+Shift+F3",
    },
    isAvailable: ({ findable, canFindAgain }) => findable && canFindAgain,
    run: ({ ownWindow }, { findAgain }) => {
      findAgain(false, ownWindow);

      return Promise.resolve();
    },
  },
  {
    id: "app.open",
    capability: "workspaceApps",
    title: () =>
      t({
        message: "New Tab…",
        comment:
          "Menu item in the Tabs menu that lists Google's apps and the selected profile's bookmarks over the page, to open one as a tab",
      }),
    shortcut: {
      darwin: "CommandOrControl+T",
      win32: "CommandOrControl+T",
      linux: "CommandOrControl+T",
    },
    once: true,
    // A second time closes it, as a second click on its button does.
    run: ({ openAppOpen }, { setOpenAppOpen }) => {
      setOpenAppOpen(!openAppOpen);

      return Promise.resolve();
    },
  },
  {
    id: "tab.bookmark",
    capability: "bookmarks",
    inOwnWindow: true,
    title: () => MENU_LABELS.bookmarkTab(),
    label: ({ bookmarked }) =>
      bookmarked === true
        ? MENU_LABELS.removeBookmark()
        : MENU_LABELS.bookmarkTab(),
    shortcut: {
      darwin: "Command+Shift+D",
      win32: "Control+Alt+Shift+D",
      linux: "Control+Alt+Shift+D",
    },
    isAvailable: ({ bookmarked }) => bookmarked !== undefined,
    once: true,
    // A tab's own window shows its star, so only the main window announces it.
    run: (context, { toggleBookmark }) =>
      toggleBookmark(actingTab(context), context.ownWindow === undefined),
  },
  {
    id: "tab.splitRight",
    capability: "splitView",
    title: () => MENU_LABELS.splitRight(),
    shortcut: {
      darwin: "Command+Alt+N",
      win32: "Control+Alt+Shift+V",
      linux: "Control+Alt+Shift+V",
    },
    isAvailable: ({ state }) =>
      splitTarget(selectedProfile(state)) !== undefined,
    once: true,
    run: (_context, { openSplit }) => {
      openSplit("row");

      return Promise.resolve();
    },
  },
  {
    id: "tab.splitDown",
    capability: "splitView",
    title: () => MENU_LABELS.splitDown(),
    shortcut: {
      darwin: "Command+Alt+Shift+N",
      win32: "Control+Alt+Shift+Down",
      linux: "Control+Alt+Shift+Down",
    },
    isAvailable: ({ state }) =>
      splitTarget(selectedProfile(state)) !== undefined,
    once: true,
    run: (_context, { openSplit }) => {
      openSplit("column");

      return Promise.resolve();
    },
  },
  {
    id: "tab.separate",
    capability: "splitView",
    title: () => MENU_LABELS.separateFromSplit(),
    isAvailable: ({ state }) => {
      const profile = selectedProfile(state);

      return isInSplit(profile, profile.selectedTabId);
    },
    run: ({ state }, { separateTab }) => separateTab(selectedTab(state)),
  },
  {
    id: "tab.moveToNewWindow",
    capability: "workspaceApps",
    title: () => MENU_LABELS.moveToNewWindow(),
    shortcut: {
      darwin: "CommandOrControl+Shift+N",
      win32: "CommandOrControl+Shift+N",
      linux: "CommandOrControl+Shift+N",
    },
    isAvailable: ({ state }) => {
      const tab = findTab(state, selectedTab(state));

      return tab !== undefined && canMoveToOwnWindow(tab);
    },
    once: true,
    run: ({ state }, { moveToOwnWindow }) =>
      moveToOwnWindow(selectedTab(state)),
  },
  {
    id: "tab.moveToMainWindow",
    capability: "workspaceApps",
    title: () => MENU_LABELS.moveToMainWindow(),
    shortcut: {
      darwin: "CommandOrControl+Shift+M",
      win32: "CommandOrControl+Shift+M",
      linux: "CommandOrControl+Shift+M",
    },
    inOwnWindow: true,
    isAvailable: ({ ownWindow }) => ownWindow !== undefined,
    once: true,
    run: ({ ownWindow }, { moveToMainWindow }) =>
      ownWindow ? moveToMainWindow(ownWindow) : Promise.resolve(),
  },
  {
    id: "tab.maximize",
    capability: "splitView",
    title: () => MENU_LABELS.maximizePane(),
    label(context) {
      return isMaximized(selectedProfile(context.state))
        ? MENU_LABELS.restorePanes()
        : this.title();
    },
    shortcut: {
      darwin: "Control+Command+Enter",
      win32: "Control+Alt+Shift+Enter",
      linux: "Control+Alt+Shift+Enter",
    },
    isAvailable: ({ state }) =>
      splitPanes(selectedProfile(state)) !== undefined,
    once: true,
    run: ({ state }, { maximizePane }) =>
      maximizePane(selectedTab(state), !isMaximized(selectedProfile(state))),
  },
  {
    id: "tab.next",
    capability: "workspaceApps",
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
    capability: "workspaceApps",
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
    capability: "workspaceApps",
    title: () => MENU_LABELS.closeTab(),
    shortcut: {
      darwin: "CommandOrControl+Shift+W",
      win32: "CommandOrControl+Shift+W",
      linux: "CommandOrControl+Shift+W",
    },
    inOwnWindow: true,
    isAvailable: (context) => {
      const tab = findTab(context.state, actingTab(context));

      return !context.settingsFocused && tab !== undefined && canCloseTab(tab);
    },
    once: true,
    run: (context, { closeTab }) => closeTab(actingTab(context)),
  },
  {
    id: "tab.sleep",
    title: () =>
      t({
        message: "Sleep Tab",
        comment:
          "Menu item in the Tabs menu that frees the selected tab's page until it is woken, keeping its place",
      }),
    label(context) {
      return context.selectedTabAsleep
        ? t({
            message: "Wake Tab",
            comment:
              "Menu item in the Tabs menu, in place of Sleep Tab while the selected tab sleeps, that loads its page again",
          })
        : this.title();
    },
    isAvailable: ({ state }) =>
      findTab(state, selectedTab(state)) !== undefined,
    run: async ({ state, selectedTabAsleep }, { sleepTab, selectTab }) => {
      const key = selectedTab(state);

      if (selectedTabAsleep) {
        await selectTab(key);
      } else {
        sleepTab(key);
      }
    },
  },
  {
    id: "tab.pin",
    capability: "workspaceApps",
    title: () =>
      t({
        message: "Pin Tab",
        comment:
          "Menu item in the Tabs menu that pins the selected tab, which keeps it from closing",
      }),
    label(context) {
      const tab = findTab(context.state, selectedTab(context.state));

      return tab && isPinned(tab)
        ? t({
            message: "Unpin Tab",
            comment:
              "Menu item in the Tabs menu, in place of Pin Tab while the selected tab is pinned, that unpins it so it can close",
          })
        : this.title();
    },
    isAvailable: ({ state }) =>
      findTab(state, selectedTab(state)) !== undefined,
    run: ({ state }, { setTabPinned }) => {
      const key = selectedTab(state);
      const tab = findTab(state, key);

      return tab ? setTabPinned(key, !isPinned(tab)) : Promise.resolve();
    },
  },
  {
    id: "tab.openAtLaunch",
    capability: "workspaceApps",
    title: () => MENU_LABELS.openAtLaunch(),
    isAvailable: ({ state }) => {
      const tab = findTab(state, selectedTab(state));

      return tab !== undefined && isPinned(tab);
    },
    isChecked: ({ state }) => {
      const tab = findTab(state, selectedTab(state));

      return tab !== undefined && opensAtLaunch(tab);
    },
    run: ({ state }, { setTabOpenAtLaunch }) => {
      const key = selectedTab(state);
      const tab = findTab(state, key);

      return tab
        ? setTabOpenAtLaunch(key, tab.openAtLaunch !== true)
        : Promise.resolve();
    },
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
    id: "profile.sleep",
    title: () =>
      t({
        message: "Sleep Profile",
        comment:
          "Menu item in the Window menu that closes every page of the selected profile until it is woken, its mail still checked",
      }),
    // The selected profile is always awake; the last awake one cannot sleep.
    isAvailable: ({ state }) => canSleepProfile(state, state.selectedProfileId),
    run: ({ state }, { sleepProfile }) => sleepProfile(state.selectedProfileId),
  },
  ...Array.from({ length: PROFILE_SHORTCUT_COUNT }, (_, index): Command => {
    const position = index + 1;

    return {
      id: selectProfileCommandId(position),
      title: () =>
        t({
          message: `Select Profile ${position}`,
          comment:
            "Command that selects the profile at this place in the title bar's row, counting from 1; the Window menu shows the profile's name instead",
        }),
      shortcut: {
        darwin: `Control+Command+${position}`,
        win32: `Control+${position}`,
        linux: `Control+${position}`,
      },
      isAvailable: ({ state }) => enabledProfiles(state).length > index,
      once: true,
      run: async ({ state }, { selectProfile, setInboxOpen }) => {
        const profile = enabledProfiles(state)[index];

        if (profile) {
          await selectProfile(profile.id);
          setInboxOpen(false);
        }
      },
    };
  }),
  ...Array.from({ length: PINNED_SHORTCUT_COUNT }, (_, index): Command => {
    const position = index + 1;
    // Counted as drawn, a split's box among the pinned coming first.
    const pinnedTab = (state: State) =>
      drawnTabs(selectedProfile(state)).filter(isPinned)[index];

    return {
      id: selectPinnedCommandId(position),
      capability: "workspaceApps",
      title: () =>
        t({
          message: `Select Pinned Tab ${position}`,
          comment:
            "Command that selects the selected profile's pinned tab at this place in the sidebar's pinned area, counting from 1; the Tabs menu shows the tab's Google app instead",
        }),
      // The app's name rather than the tab's title, which changes as its
      // page does and would set the menu again each time.
      label: ({ state }) => {
        const tab = pinnedTab(state);

        return (tab && findApp(APPS, tab.app)?.name) ?? tab?.app ?? "";
      },
      shortcut: {
        darwin: `Control+Alt+${position}`,
        win32: `Control+Alt+Shift+${position}`,
        linux: `Control+Alt+Shift+${position}`,
      },
      isAvailable: ({ state }) => pinnedTab(state) !== undefined,
      once: true,
      run: async ({ state }, { selectTab, setInboxOpen }) => {
        const tab = pinnedTab(state);

        if (tab) {
          await selectTab({
            profileId: state.selectedProfileId,
            tabId: tab.id,
          });
          setInboxOpen(false);
        }
      },
    };
  }),
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
    shortcut: {
      darwin: "Control+Command+,",
      win32: "Control+Alt+Shift+,",
      linux: "Control+Alt+Shift+,",
    },
    run: navigateTo(SETTINGS_HASH),
  },
  {
    id: "savedSearch.save",
    capability: "savedSearches",
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
        savedSearchRefusal(state, state.selectedProfileId, query) === undefined
      );
    },
    run: ({ state }, { addSavedSearch }) => {
      const query = currentSearch(state);

      return query === undefined
        ? Promise.resolve()
        : addSavedSearch(state.selectedProfileId, query);
    },
  },
  {
    id: "doNotDisturb.toggle",
    capability: "notificationGates",
    inOwnWindow: true,
    title: () =>
      t({
        message: "Do Not Disturb",
        comment:
          "Command that turns Do Not Disturb on until turned off, or off, checked while it holds new mail notifications",
      }),
    isChecked: doNotDisturbHolds,
    run: (context, { switchDoNotDisturb }) =>
      switchDoNotDisturb(doNotDisturbHolds(context) ? "off" : UNTIL_OFF),
  },
  {
    id: "doNotDisturb.off",
    capability: "notificationGates",
    inOwnWindow: true,
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
    capability: "notificationGates",
    inOwnWindow: true,
    title: () => durationTitle(duration),
    run: (_context, { switchDoNotDisturb }) => switchDoNotDisturb(duration),
  })),
];
