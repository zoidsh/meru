import type { App } from "#core/apps.ts";
import { contentViewBounds } from "#core/layout.ts";
import type { Platform } from "#core/platform.ts";
import { findTab, tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { createClipboard } from "#platform/clipboard.ts";
import type { createIpc } from "#platform/ipc.ts";
import type { createSystemBrowser } from "#platform/system-browser.ts";

import type { createApplicationMenu } from "../application-menu.ts";
import type { Bookmarks } from "../bookmarks.ts";
import { COMMANDS } from "../commands.ts";
import { commandAccelerator } from "../context-menu.ts";
import type { createDoNotDisturb } from "../do-not-disturb.ts";
import type { Downloads } from "../downloads.ts";
import type { Find } from "../find.ts";
import type { Focus } from "../focus.ts";
import type { Inbox } from "../inbox.ts";
import type { Language } from "../language.ts";
import type { MailPoller } from "../mail.ts";
import type { OpenApp } from "../open-app.ts";
import type { Overlays } from "../overlay.ts";
import type { OwnWindows } from "../own-windows.ts";
import { createPaneResize } from "../pane-resize.ts";
import { createProfileMenu } from "../profile-menu.ts";
import type { Profiles } from "../profiles.ts";
import type { SenderRegistry } from "../senders.ts";
import type { SettingsStore } from "../settings.ts";
import {
  createShellHandlers,
  shellShortcuts,
  shellState,
  shellTabStatus,
} from "../shell-handlers.ts";
import { serveShellContract } from "../shell-ipc.ts";
import type { createShellWindow } from "../shell-window.ts";
import type { createShowGmail } from "../show-gmail.ts";
import type { Sidebar } from "../sidebar.ts";
import { createTabMenu } from "../tab-menu.ts";
import type { createTabViews } from "../tab-views.ts";

/**
 * The shell's calls and the state it draws, with the tab's and the
 * profile's menus and the split's resizing they reach.
 */
export const wireShellContract = ({
  platform,
  apps,
  ipc,
  senders,
  shellOrigin,
  shell,
  profiles,
  views,
  ownWindows,
  overlays,
  find,
  focus,
  sidebar,
  inbox,
  downloads,
  mail,
  doNotDisturb,
  openApp,
  bookmarks,
  menu,
  showGmail,
  showOwnWindow,
  moveToOwnWindow,
  moveToMainWindow,
  livePageUrl,
  clipboard,
  systemBrowser,
  settings,
  language,
}: {
  platform: Platform;
  /** The language Meru shows, which the shell shows too. */
  language: Pick<Language, "current" | "onChange">;
  apps: readonly App[];
  ipc: ReturnType<typeof createIpc>;
  senders: SenderRegistry;
  shellOrigin: string;
  shell: ReturnType<typeof createShellWindow>;
  profiles: Profiles;
  views: ReturnType<typeof createTabViews>;
  ownWindows: OwnWindows;
  overlays: Overlays;
  find: Find;
  focus: Focus;
  sidebar: Sidebar;
  inbox: Inbox;
  downloads: Downloads;
  mail: MailPoller;
  doNotDisturb: ReturnType<typeof createDoNotDisturb>;
  openApp: OpenApp;
  bookmarks: Bookmarks;
  menu: ReturnType<typeof createApplicationMenu>;
  showGmail: ReturnType<typeof createShowGmail>;
  showOwnWindow: (key: TabKey) => void;
  moveToOwnWindow: (key: TabKey) => Promise<boolean>;
  moveToMainWindow: (key: TabKey) => Promise<boolean>;
  livePageUrl: (key: TabKey) => string | undefined;
  clipboard: ReturnType<typeof createClipboard>;
  systemBrowser: ReturnType<typeof createSystemBrowser>;
  settings: Pick<SettingsStore, "get" | "onChange">;
}) => {
  const shortcuts = shellShortcuts(COMMANDS, platform);
  const ariaShortcuts = shellShortcuts(COMMANDS, platform, true);
  const paneResize = createPaneResize({
    state: profiles.get,
    resizeSplit: profiles.resizeSplit,
    areaSize: views.areaSize,
    preview: views.preview,
    log: console.error,
  });
  shell.window.onPageGone(paneResize.cancel);

  const tabMenu = createTabMenu({
    state: profiles.get,
    apps,
    window: shell.window,
    ownWindow: (key) => ownWindows.window(key),
    accelerator: commandAccelerator(COMMANDS, platform),
    bookmarks,
    profiles,
    moveToOwnWindow,
    moveToMainWindow,
    isLoaded: (key) => views.status(key).kind !== "unloaded",
    pageUrl: livePageUrl,
    reload: views.reload,
    sleep: views.sleep,
    wake: views.select,
    openTab: views.open,
    openSplit: openApp.openSplit,
    clipboard,
    systemBrowser,
    log: console.error,
  });
  const profileMenu = createProfileMenu({
    state: profiles.get,
    window: shell.window,
    profiles,
    log: console.error,
  });

  serveShellContract({
    ipc,
    senders,
    shellOrigin,
    handlers: createShellHandlers({
      profiles,
      overlays,
      find,
      tabs: views,
      revealOwnWindow: showOwnWindow,
      navigateTab: async (key, action) => {
        switch (action) {
          case "back": {
            views.goBack(key);
            break;
          }
          case "forward": {
            views.goForward(key);
            break;
          }
          case "stop": {
            views.stopFront(key);
            break;
          }
          default: {
            await views.reload(key);
          }
        }
      },
      inbox,
      downloads,
      openApp,
      bookmarks,
      tabMenu,
      panes: paneResize,
      pageSize: () =>
        contentViewBounds(
          shell.window.getContentAreaSize(),
          sidebar.current(),
          platform
        ),
      profileMenu,
      openGmail: showGmail.jumpTo,
      window: shell.window,
      sidebar,
      focus,
      runCommand: menu.runCommand,
      doNotDisturbItems: menu.doNotDisturbItems,
      log: console.error,
    }),
    state: {
      read: () =>
        shellState(
          profiles.get(),
          views.status,
          {
            selectedAsleep: views.frontAsleep(),
            panes: views.panes(),
            handles: views.handles(),
            find: find.current(),
            bookmarked: bookmarks.bookmarked,
            bookmarks: bookmarks.rows,
          },
          overlays.current(),
          mail.mail,
          doNotDisturb.current(),
          inbox.shellSlice(),
          {
            language: language.current(),
            sidebar: { state: sidebar.current() },
            appearance: {
              tint: settings.get("profileTint"),
              buttons: {
                newTab: settings.get("titlebarNewTab"),
                unifiedInbox: settings.get("titlebarUnifiedInbox"),
                downloads: settings.get("titlebarDownloads"),
                doNotDisturb: settings.get("titlebarDoNotDisturb"),
              },
            },
            shortcuts,
            ariaShortcuts,
            navigation: views.navigation(),
            downloads: downloads.shellSlice(),
            windows: views.windowTabs().flatMap((key) => {
              const tab = findTab(profiles.get(), key);
              const navigation = views.navigation(key);
              const bar = find.bar(key);
              const card = downloads.window();

              return tab && navigation
                ? [
                    {
                      ...key,
                      app: tab.app,
                      title: tab.title,
                      status: shellTabStatus(views.status(key)),
                      navigation,
                      bookmarked: bookmarks.bookmarked(key) ?? null,
                      downloads:
                        card !== undefined && tabKey(card) === tabKey(key),
                      find: bar
                        ? {
                            term: bar.term,
                            ordinal: bar.ordinal,
                            matches: bar.matches,
                            opened: bar.opened,
                          }
                        : null,
                    },
                  ]
                : [];
            }),
          },
          apps
        ),
      onChange: (listener) => {
        language.onChange(listener);
        profiles.onChange(listener);
        mail.onChange(listener);
        views.onChange(listener);
        overlays.onChange(listener);
        find.onChange(listener);
        inbox.onChange(listener);
        downloads.onChange(listener);
        sidebar.onChange(listener);
        for (const key of [
          "profileTint",
          "titlebarNewTab",
          "titlebarUnifiedInbox",
          "titlebarDownloads",
          "titlebarDoNotDisturb",
        ] as const) {
          settings.onChange(key, listener);
        }
      },
    },
    log: console.error,
  });
};
