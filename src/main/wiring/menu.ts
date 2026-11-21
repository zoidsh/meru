import { coversPage } from "#core/overlay.ts";
import type { Platform } from "#core/platform.ts";
import { tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import { i18n } from "#i18n/index.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import { setApplicationMenu } from "#platform/menu.ts";
import { zoomFocused } from "#platform/zoom.ts";

import { createApplicationMenu } from "../application-menu.ts";
import type { Bookmarks } from "../bookmarks.ts";
import { COMMANDS, NO_PAGE } from "../commands.ts";
import type { createDoNotDisturb } from "../do-not-disturb.ts";
import type { Downloads } from "../downloads.ts";
import type { Find } from "../find.ts";
import type { Focus } from "../focus.ts";
import type { createGmailNavigation } from "../gmail-navigation.ts";
import type { Inbox } from "../inbox.ts";
import type { OpenApp } from "../open-app.ts";
import type { Overlays } from "../overlay.ts";
import type { Profiles } from "../profiles.ts";
import { createRemoveProfile } from "../remove-profile.ts";
import type { createShellWindow } from "../shell-window.ts";
import type { Sidebar } from "../sidebar.ts";
import type { createTabViews } from "../tab-views.ts";
import { revealWindow } from "../windows.ts";
import { createZoom } from "../zoom.ts";

/** The role's own key on Windows and Linux, Ctrl+Shift+I, is the unified inbox's. */
const devToolsAccelerator = (platform: Platform) =>
  platform === "darwin" ? "Alt+Command+I" : "F12";

/**
 * The application menu, whose commands act on the main window or on the tab
 * whose own window has focus, and the moves between windows they share with
 * the tab's menu.
 */
export const wireMenu = ({
  platform,
  background,
  lifecycle,
  shell,
  shellDocumentIds,
  profiles,
  views,
  overlays,
  focus,
  find,
  sidebar,
  inbox,
  downloads,
  doNotDisturb,
  openApp,
  bookmarks,
  navigateGmail,
  showOwnWindow,
  openSettings,
  settingsFocused,
  onSettingsFocusChange,
}: {
  platform: Platform;
  background: boolean;
  lifecycle: ReturnType<typeof createAppLifecycle>;
  shell: ReturnType<typeof createShellWindow>;
  shellDocumentIds: ReadonlySet<number>;
  profiles: Profiles;
  views: ReturnType<typeof createTabViews>;
  overlays: Overlays;
  focus: Focus;
  find: Find;
  sidebar: Sidebar;
  inbox: Inbox;
  downloads: Downloads;
  doNotDisturb: ReturnType<typeof createDoNotDisturb>;
  openApp: OpenApp;
  bookmarks: Bookmarks;
  navigateGmail: ReturnType<typeof createGmailNavigation>;
  showOwnWindow: (key: TabKey) => void;
  openSettings: () => void;
  /** Whether the Settings window has the keys. */
  settingsFocused: () => boolean;
  onSettingsFocusChange: (listener: () => void) => void;
}) => {
  /** The tab whose own window has focus, its page or its titlebar. */
  const focusedOwnWindow = (): TabKey | undefined => {
    const focused = focus.focused();

    return focused?.kind === "window" &&
      views.windowTabs().some((key) => tabKey(key) === tabKey(focused.key))
      ? focused.key
      : undefined;
  };

  const moveToOwnWindow = async (key: TabKey) => {
    const moved = await profiles.moveToOwnWindow(key);

    if (moved) {
      showOwnWindow(key);
    }

    return moved;
  };

  /** Puts the tab back selected, showing the main window should it be hidden. */
  const moveToMainWindow = async (key: TabKey) => {
    const moved = await profiles.moveToMainWindow(key, true);

    if (moved) {
      revealWindow(shell.window, background);
    }

    return moved;
  };

  const menu = createApplicationMenu({
    platform,
    zoom: createZoom({
      zoomFocused,
      isShellDocument: (id) => shellDocumentIds.has(id),
      zoomPage: (change) => {
        views.zoomFront(change, focusedOwnWindow());
      },
    }),
    appName: lifecycle.name,
    commands: COMMANDS,
    context: () => {
      const inSettings = settingsFocused();
      const ownWindow = inSettings ? undefined : focusedOwnWindow();
      const base = {
        state: profiles.get(),
        ownWindow,
        settingsFocused: inSettings,
        doNotDisturb: doNotDisturb.current(),
        inboxOpen: inbox.isOpen(),
        downloadsOpen: downloads.isOpen(),
        openAppOpen: openApp.isOpen(),
        sidebarShown: sidebar.current() !== "hidden",
      };

      return inSettings
        ? { ...base, ...NO_PAGE }
        : {
            ...base,
            navigation: views.navigation(ownWindow),
            selectedTabAsleep: ownWindow === undefined && views.frontAsleep(),
            findable:
              ownWindow === undefined
                ? views.findable() !== undefined &&
                  !coversPage(overlays.current())
                : views.ownWindowFocuser(ownWindow) !== undefined,
            canFindAgain: find.canGoOn(ownWindow),
            bookmarked: bookmarks.acting(ownWindow),
          };
    },
    actions: {
      reloadSelectedTab: () => {
        const ownWindow = focusedOwnWindow();

        if (ownWindow) {
          void views.reload(ownWindow);
        } else {
          views.reloadFront();
        }
      },
      goBack: () => {
        views.goBack(focusedOwnWindow());
      },
      goForward: () => {
        views.goForward(focusedOwnWindow());
      },
      stopLoading: () => {
        views.stopFront(focusedOwnWindow());
      },
      moveToOwnWindow,
      moveToMainWindow,
      // A pinned tab's shortcut brings its own window forward, as its click does.
      selectTab: async (key) => {
        if (views.windowTabs().some((each) => tabKey(each) === tabKey(key))) {
          showOwnWindow(key);

          return;
        }

        await views.select(key);
      },
      sleepTab: views.sleep,
      closeTab: profiles.closeTab,
      setTabPinned: profiles.setPinned,
      setTabOpenAtLaunch: profiles.setOpenAtLaunch,
      selectProfile: profiles.select,
      sleepProfile: profiles.sleep,
      addProfile: profiles.add,
      removeProfile: createRemoveProfile({
        profiles,
        window: shell.window,
        log: console.error,
      }),
      openRenameProfile: (profileId) => {
        overlays.open({ kind: "rename-profile", profileId });
      },
      switchDoNotDisturb: (choice) =>
        choice === "off"
          ? doNotDisturb.switchOff()
          : doNotDisturb.switchOn(choice),
      setInboxOpen: inbox.setOpen,
      setDownloadsOpen: downloads.setOpen,
      setOpenAppOpen: openApp.setOpen,
      openSplit: openApp.openSplit,
      separateTab: profiles.separateTab,
      maximizePane: profiles.maximizePane,
      toggleSidebar: sidebar.toggleShown,
      navigateGmail,
      saveSearch: profiles.saveSearch,
      removeSavedSearch: profiles.removeSavedSearch,
      openFind: find.open,
      findAgain: find.again,
      toggleBookmark: bookmarks.toggle,
      openSettings,
    },
    locale: () => i18n.locale,
    setMenu: setApplicationMenu,
    ...(MERU_BUILD_MODE === "dev" && {
      developerTools: {
        role: "toggleDevTools" as const,
        accelerator: devToolsAccelerator(platform),
      },
    }),
    log: console.error,
  });

  profiles.onChange(menu.refresh);
  inbox.onChange(menu.refresh);
  // Opening and closing the inbox, which Back, Forward and Reload follow.
  overlays.onChange(menu.refresh);
  sidebar.onChange(menu.refresh);
  // A term remembered, which Find Next and Previous need.
  find.onChange(menu.refresh);
  // A load starting or stopping, or the history moving, changes what Back,
  // Forward and Stop offer.
  views.onChange(menu.refresh);
  // Focus moving between the main window and a tab's own window changes
  // which commands run.
  focus.onFocused(menu.refresh);
  onSettingsFocusChange(menu.refresh);

  return { menu, moveToOwnWindow, moveToMainWindow };
};
