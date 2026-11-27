import type { ShellCalls, ShellState } from "#contract/shell.ts";
import { ariaKeyShortcut, formatAccelerator } from "#core/accelerator.ts";
import type { App } from "#core/apps.ts";
import { menuPointInside } from "#core/context-menu.ts";
import type { FindBar } from "#core/find.ts";
import { viewFrame } from "#core/layout.ts";
import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import { openableApps, splittableApps } from "#core/open-app.ts";
import type { Overlay } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import { profileColor } from "#core/profile-color.ts";
import { splitBoxes, splitRoomy } from "#core/split.ts";
import {
  enabledProfiles,
  inOwnWindow,
  isAsleep,
  isPinned,
  knownTabs,
  selectedProfile,
} from "#core/state.ts";
import type { DoNotDisturb, State } from "#core/state.ts";
import type { TabStatus } from "#core/tab-machine.ts";
import { findTab, isMainWindowTab, splitOntoTab, tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import { inViewReach, viewDrop } from "#core/view-drop.ts";
import type { Size } from "#core/window-bounds.ts";
import type { ContextMenuItem } from "#platform/context-menu.ts";
import type { AppWindow } from "#platform/window.ts";

import type { Bookmarks } from "./bookmarks.ts";
import type { Command } from "./commands.ts";
import type { Downloads } from "./downloads.ts";
import type { Find } from "./find.ts";
import type { Focus } from "./focus.ts";
import type { Inbox } from "./inbox.ts";
import type { Mail } from "./mail.ts";
import type { OpenApp } from "./open-app.ts";
import type { Overlays } from "./overlay.ts";
import type { PaneResizer } from "./pane-resize.ts";
import { profileDisplayName } from "./profile-copy.ts";
import type { ProfileMenu } from "./profile-menu.ts";
import type { ProfileQuestion } from "./profile-question.ts";
import type { Profiles } from "./profiles.ts";
import type { ScreenPicker } from "./screen-picker.ts";
import type { SentCompose } from "./sent-compose.ts";
import type { LaunchHandlers, ShellHandlers } from "./shell-ipc.ts";
import type { Sidebar } from "./sidebar.ts";
import type { TabMenu } from "./tab-menu.ts";
import type { UpdateCardModule } from "./update-card.ts";

export interface ShellHandlersDeps {
  profiles: Pick<
    Profiles,
    | "get"
    | "select"
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
  find: Pick<Find, "type" | "step" | "close">;
  updateCard: Pick<UpdateCardModule, "run">;
  /** Selecting a tab through them wakes it if it sleeps. */
  tabs: {
    retry: (key: TabKey) => void;
    select: (key: TabKey) => Promise<unknown>;
  };
  /** Brings a tab's own window forward, its page focused, as clicking its tab does. */
  revealOwnWindow: (key: TabKey) => void;
  /** Goes back or forward on a tab's page, or reloads or stops it. */
  navigateTab: (
    key: TabKey,
    action: Parameters<ShellCalls["navigate"]>[0]["action"]
  ) => Promise<unknown>;
  inbox: Pick<Inbox, "setOpen" | "openMessage" | "runAction">;
  downloads: Pick<
    Downloads,
    | "setOpen"
    | "openFile"
    | "showInFolder"
    | "drag"
    | "cancel"
    | "remove"
    | "clear"
  >;
  screenPicker: Pick<
    ScreenPicker,
    "share" | "cancel" | "retry" | "openSettings"
  >;
  profileQuestion: Pick<ProfileQuestion, "answer">;
  sentCompose: Pick<SentCompose, "undo">;
  openApp: Pick<OpenApp, "choose" | "chooseBookmark" | "removeBookmark">;
  bookmarks: Pick<Bookmarks, "toggle">;
  tabMenu: Pick<TabMenu, "open" | "openOwnWindow">;
  panes: Pick<PaneResizer, "resize" | "evenOut">;
  profileMenu: Pick<ProfileMenu, "open">;
  /** Selects the profile's Gmail as the tray's profile item does. */
  openGmail: (profileId: string) => Promise<unknown>;
  window: Pick<AppWindow, "showContextMenu" | "getContentAreaSize">;
  sidebar: Pick<Sidebar, "current" | "toggleWidth">;
  /** Whether the trial footer shows below the page. */
  trialFooter: () => boolean;
  focus: Pick<Focus, "focus">;
  /** Runs a command of the registry, as its menu item would. */
  runCommand: (id: string) => void;
  /** The Do Not Disturb menu as the application menu has it now. */
  doNotDisturbItems: () => ContextMenuItem[];
  log: Log;
}

type ShellTabStatus = ShellState["tabs"]["tabs"][number]["status"];

export const shellTabStatus = (status: TabStatus): ShellTabStatus => {
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

const shellFind = (
  overlay: Extract<Overlay, { kind: "find" }>,
  bar: FindBar | undefined
): ShellState["overlay"] =>
  bar && tabKey(bar.key) === tabKey(overlay)
    ? {
        kind: "find",
        profileId: overlay.profileId,
        tabId: overlay.tabId,
        term: bar.term,
        ordinal: bar.ordinal,
        matches: bar.matches,
        opened: bar.opened,
      }
    : { kind: "none" };

type BookmarkRows = Extract<
  ShellState["overlay"],
  { kind: "open-app" }
>["bookmarks"];

const shellOverlay = (
  state: State,
  overlay: Overlay | undefined,
  status: (key: TabKey) => TabStatus,
  apps: readonly App[],
  find: FindBar | undefined,
  bookmarkRows: (profileId: string) => BookmarkRows
): ShellState["overlay"] => {
  if (
    overlay?.kind === "inbox" ||
    overlay?.kind === "downloads" ||
    overlay?.kind === "license" ||
    overlay?.kind === "screen-picker"
  ) {
    return { kind: overlay.kind };
  }

  if (overlay?.kind === "update") {
    return { kind: "update", card: overlay.card, version: overlay.version };
  }

  if (overlay?.kind === "profile-question") {
    return { kind: "profile-question", profileIds: overlay.profileIds };
  }

  if (overlay?.kind === "find") {
    return shellFind(overlay, find);
  }

  if (overlay?.kind === "toast" || overlay?.kind === "drop") {
    return shellNotice(overlay);
  }

  return overlay
    ? shellProfileOverlay(state, overlay, apps, bookmarkRows)
    : { kind: "none" };
};

/** A toast, or a drop's zone, neither of which takes focus. */
const shellNotice = (
  overlay: Extract<Overlay, { kind: "toast" | "drop" }>
): ShellState["overlay"] =>
  overlay.kind === "toast"
    ? { kind: "toast", message: overlay.message, title: overlay.title ?? null }
    : {
        kind: "drop",
        ...overlay.zone,
        along: overlay.along,
        fits: overlay.fits,
      };

/** An overlay over a profile, which shows nothing once that profile is gone. */
const shellProfileOverlay = (
  state: State,
  overlay: Extract<Overlay, { kind: "open-app" }>,
  apps: readonly App[],
  bookmarkRows: (profileId: string) => BookmarkRows
): ShellState["overlay"] => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === overlay.profileId
  );

  if (!profile) {
    return { kind: "none" };
  }

  return {
    kind: "open-app",
    profileId: profile.id,
    apps: (overlay.split
      ? splittableApps(apps, profile)
      : openableApps(apps, profile)
    ).map(({ id, name }) => ({ id, name })),
    bookmarks: bookmarkRows(profile.id),
    split: overlay.split ?? null,
  };
};

/** Keys a control in the shell acts on that are no command's, by Electron's name. */
const SHELL_KEYS = ["Enter", "Shift+Enter", "Escape"];

/**
 * The registry's shortcuts as the shell shows them, or with `aria` as
 * `aria-keyshortcuts` names them, by command id, and the shell's own keys
 * by `key:` and their name, such as `key:Shift+Enter`.
 */
export const shellShortcuts = (
  commands: readonly Pick<Command, "id" | "shortcut">[],
  platform: Platform,
  aria = false
): ShellState["shortcuts"] => {
  const written = (accelerator: string) =>
    aria
      ? ariaKeyShortcut(accelerator, platform)
      : formatAccelerator(accelerator, platform);

  return Object.fromEntries([
    ...commands.flatMap(({ id, shortcut }) => {
      const accelerator = shortcut?.[platform];

      return accelerator ? [[id, written(accelerator)]] : [];
    }),
    ...SHELL_KEYS.map((key) => [`key:${key}`, written(key)]),
  ]);
};

/** The slices the shell sees of main's state, names ready to show. */
export const shellState = (
  state: State,
  status: (key: TabKey) => TabStatus,
  page: {
    /** Whether the selected tab was put to sleep, and so has no page. */
    selectedAsleep: boolean;
    panes: ShellState["tabs"]["panes"];
    handles: ShellState["tabs"]["handles"];
    /** The find bar, while it is open over a page. */
    find?: FindBar | undefined;
    /**
     * Whether the tab's page is bookmarked, or `undefined` while it cannot
     * be; none can be without it.
     */
    bookmarked?: (key: TabKey) => boolean | undefined;
    /** The profile's bookmarks as New tab lists them. */
    bookmarks?: (profileId: string) => BookmarkRows;
  },
  overlay: Overlay | undefined,
  mail: (profileId: string) => Mail,
  doNotDisturb: DoNotDisturb | undefined,
  inbox: ShellState["inbox"],
  fixed: Pick<
    ShellState,
    | "language"
    | "sidebar"
    | "appearance"
    | "shortcuts"
    | "ariaShortcuts"
    | "navigation"
    | "windows"
    | "downloads"
    | "pro"
    | "screenPicker"
  >,
  /** The registry, or the suite's stand-ins for it, which New tab lists. */
  apps: readonly App[]
): ShellState => {
  const profile = selectedProfile(state);

  return {
    profiles: {
      profiles: enabledProfiles(state).map((candidate) => ({
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
        ownWindow: inOwnWindow(tab),
        status: shellTabStatus(
          status({ profileId: profile.id, tabId: tab.id })
        ),
        bookmarked:
          page.bookmarked?.({ profileId: profile.id, tabId: tab.id }) ?? null,
      })),
      panes: page.panes,
      handles: page.handles,
      boxes: splitBoxes(profile),
    },
    doNotDisturb: {
      on: doNotDisturb !== undefined,
      until: doNotDisturb?.until ?? null,
    },
    overlay: shellOverlay(
      state,
      overlay,
      status,
      apps,
      page.find,
      page.bookmarks ?? (() => [])
    ),
    inbox,
    ...fixed,
  };
};

export const createShellHandlers = ({
  profiles,
  overlays,
  find,
  updateCard,
  tabs,
  revealOwnWindow,
  navigateTab,
  inbox,
  downloads,
  screenPicker,
  profileQuestion,
  sentCompose,
  openApp,
  bookmarks,
  tabMenu,
  panes,
  pageSize,
  profileMenu,
  openGmail,
  window,
  sidebar,
  trialFooter,
  focus,
  runCommand,
  doNotDisturbItems,
  log,
}: ShellHandlersDeps): Omit<ShellHandlers, keyof LaunchHandlers> => {
  const inset = () =>
    viewFrame({ sidebar: sidebar.current(), trialFooter: trialFooter() }).inset;

  return {
    // Each that selects closes the unified inbox, even when what it asks for
    // is selected already, since the person asked to see it.
    selectProfile: async ({ profileId }) => {
      await profiles.select(profileId);
      inbox.setOpen(false);
    },
    // A tab in its own window selects nothing in the main window.
    selectTab: async (key) => {
      const tab = findTab(profiles.get(), key);

      if (tab && inOwnWindow(tab)) {
        revealOwnWindow(key);

        return;
      }

      await tabs.select(key);
      inbox.setOpen(false);
    },
    moveTab: async ({ profileId, tabId, before }) => {
      if (profileId === profiles.get().selectedProfileId) {
        await profiles.moveTab({ profileId, tabId }, before);
      } else {
        log("tab-move-refused", {
          tab: scrub.tab({ profileId, tabId }),
          reason: "profile-not-selected",
        });
      }
    },
    moveInBox: async ({ profileId, tabId, before }) => {
      if (profileId === profiles.get().selectedProfileId) {
        await profiles.moveInBox({ profileId, tabId }, before);
      } else {
        log("tab-move-refused", {
          tab: scrub.tab({ profileId, tabId }),
          reason: "profile-not-selected",
        });
      }
    },
    aimTab: ({ profileId, tabId, point }) => {
      const state = profiles.get();
      const size = pageSize();
      const drop =
        point &&
        profileId === state.selectedProfileId &&
        isMainWindowTab(selectedProfile(state), tabId) &&
        inViewReach(size, inset(), point)
          ? viewDrop(selectedProfile(state), size, point, tabId)
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

      const size = pageSize();

      if (!inViewReach(size, inset(), { x, y })) {
        log("tab-drop-refused", {
          tab: scrub.tab({ profileId, tabId }),
          reason: "outside-pages",
        });
      } else if (profileId === profiles.get().selectedProfileId) {
        await profiles.dropInView({ profileId, tabId }, size, { x, y });
      } else {
        log("tab-drop-refused", {
          tab: scrub.tab({ profileId, tabId }),
          reason: "profile-not-selected",
        });
      }
    },
    splitOntoTab: async ({ profileId, tabId, target }) => {
      const state = profiles.get();

      if (profileId !== state.selectedProfileId) {
        log("tab-split-refused", {
          tab: scrub.tab({ profileId, tabId }),
          reason: "profile-not-selected",
        });

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
    closeOverlay: () => {
      const open = overlays.current()?.kind;

      if (open === "find") {
        find.close();
      } else if (open === "update") {
        // Escape is Later or Close, or the card would come straight back.
        updateCard.run("dismiss");
      } else {
        overlays.close();
      }

      return Promise.resolve();
    },
    runUpdateCard: ({ action }) => {
      updateCard.run(action);

      return Promise.resolve();
    },
    findInPage: ({ term, tab }) => {
      find.type(term, tab);

      return Promise.resolve();
    },
    findStep: ({ forward, tab }) => {
      find.step(forward, tab);

      return Promise.resolve();
    },
    closeFind: (key) => {
      find.close(key);

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
    navigateTab: async ({ profileId, tabId, action }) => {
      await navigateTab({ profileId, tabId }, action);
    },
    toggleSidebarWidth: () => {
      sidebar.toggleWidth();

      return Promise.resolve();
    },
    toggleDoNotDisturb: () => {
      runCommand("doNotDisturb.toggle");

      return Promise.resolve();
    },
    openDoNotDisturbMenu: (point) => {
      if (menuPointInside(point, window.getContentAreaSize())) {
        window.showContextMenu(doNotDisturbItems(), point);
      } else {
        log("do-not-disturb-menu-refused", { x: point.x, y: point.y });
      }

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
    setDownloadsOpen: ({ open, window: ownWindow }) => {
      downloads.setOpen(open, ownWindow);

      return Promise.resolve();
    },
    shareScreen: async ({ source, window: ownWindow }) => {
      await screenPicker.share(source, ownWindow);
    },
    answerProfileQuestion: ({ profileId }) => {
      profileQuestion.answer(profileId);

      return Promise.resolve();
    },
    undoSent: () => {
      sentCompose.undo();

      return Promise.resolve();
    },
    cancelScreenPicker: ({ window: ownWindow }) => {
      screenPicker.cancel(ownWindow);

      return Promise.resolve();
    },
    retryScreenPicker: ({ window: ownWindow }) => {
      screenPicker.retry(ownWindow);

      return Promise.resolve();
    },
    openScreenRecordingSettings: async () => {
      await screenPicker.openSettings();
    },
    openDownload: async ({ id }) => {
      await downloads.openFile(id);
    },
    showDownload: async ({ id }) => {
      await downloads.showInFolder(id);
    },
    dragDownload: ({ id }) => {
      downloads.drag(id);

      return Promise.resolve();
    },
    cancelDownload: ({ id }) => {
      downloads.cancel(id);

      return Promise.resolve();
    },
    removeDownload: async ({ id }) => {
      await downloads.remove(id);
    },
    clearDownloads: async () => {
      await downloads.clear();
    },
    toggleOpenApp: () => {
      runCommand("app.open");

      return Promise.resolve();
    },
    openApp: async ({ appId }) => {
      await openApp.choose(appId);
    },
    openBookmark: async ({ id }) => {
      await openApp.chooseBookmark(id);
    },
    removeBookmark: async ({ id }) => {
      await openApp.removeBookmark(id);
    },
    // Only the main window's row announces it; a tab's own window shows its star.
    toggleTabBookmark: async (key) => {
      const tab = findTab(profiles.get(), key);

      if (!tab) {
        log("bookmark-refused", { tab: scrub.tab(key), reason: "tab-gone" });

        return;
      }

      await bookmarks.toggle(key, !inOwnWindow(tab));
    },
    openGmail: async ({ profileId }) => {
      await openGmail(profileId);
    },
    openTabMenu: (request) => {
      tabMenu.open(request);

      return Promise.resolve();
    },
    openOwnWindowMenu: (request) => {
      tabMenu.openOwnWindow(request);

      return Promise.resolve();
    },
    openProfileMenu: (request) => {
      profileMenu.open(request);

      return Promise.resolve();
    },
  };
};
