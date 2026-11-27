import type { ShellState } from "#contract/shell.ts";
import type { App } from "#core/apps.ts";
import type { Capability } from "#core/entitlement.ts";
import { contentViewBounds } from "#core/layout.ts";
import type { Platform } from "#core/platform.ts";
import type { PickerCard } from "#core/screen-picker.ts";
import { findTab, tabKey } from "#core/tabs.ts";
import type { TabKey } from "#core/tabs.ts";
import type { createClipboard } from "#platform/clipboard.ts";
import type { createSystemBrowser } from "#platform/system-browser.ts";

import type { createApplicationMenu } from "../application-menu.ts";
import type { Bookmarks } from "../bookmarks.ts";
import type { Command } from "../commands.ts";
import type { createDoNotDisturb } from "../do-not-disturb.ts";
import type { Downloads } from "../downloads.ts";
import type { Find } from "../find.ts";
import type { Focus } from "../focus.ts";
import type { Inbox } from "../inbox.ts";
import type { KeymapService } from "../keymap.ts";
import type { Language } from "../language.ts";
import type { MailPoller } from "../mail.ts";
import type { OpenApp } from "../open-app.ts";
import type { Overlays } from "../overlay.ts";
import type { OwnWindows } from "../own-windows.ts";
import { createPaneResize } from "../pane-resize.ts";
import { createProfileMenu } from "../profile-menu.ts";
import type { ProfileQuestion } from "../profile-question.ts";
import type { Profiles } from "../profiles.ts";
import type { ScreenPicker } from "../screen-picker.ts";
import type { SentCompose } from "../sent-compose.ts";
import type { SettingsStore } from "../settings.ts";
import {
  createShellHandlers,
  shellShortcuts,
  shellState,
  shellTabStatus,
} from "../shell-handlers.ts";
import type { LaunchHandlers, ShellSource } from "../shell-ipc.ts";
import type { createShellWindow } from "../shell-window.ts";
import type { createShowGmail } from "../show-gmail.ts";
import type { Sidebar } from "../sidebar.ts";
import { createTabMenu } from "../tab-menu.ts";
import type { createTabViews } from "../tab-views.ts";
import type { UpdateCardModule } from "../update-card.ts";

/** The card a tab's own window shows, the screen picker before Downloads. */
const ownWindowCard = (
  picker: { picker: PickerCard; request: number } | undefined,
  downloadsIn: TabKey | undefined,
  key: TabKey
): ShellState["windows"][number]["card"] => {
  if (picker) {
    return { kind: "screen-picker", ...picker };
  }

  return downloadsIn !== undefined && tabKey(downloadsIn) === tabKey(key)
    ? { kind: "downloads" }
    : null;
};

/**
 * The shell's calls and the state it draws, with the tab's and the
 * profile's menus and the split's resizing they reach.
 */
export const wireShellContract = ({
  platform,
  apps,
  shellContract,
  launchHandlers,
  pro,
  onProChange,
  trialFooter,
  shell,
  profiles,
  views,
  ownWindows,
  overlays,
  find,
  updateCard,
  focus,
  sidebar,
  inbox,
  downloads,
  screenPicker,
  profileQuestion,
  sentCompose,
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
  can,
  keymap,
}: {
  platform: Platform;
  /** Each command's key, which the shell's hints and the tab menu show. */
  keymap: Pick<KeymapService, "commands" | "accelerator" | "onChange">;
  /** The language Meru shows, which the shell shows too. */
  language: Pick<Language, "current" | "onChange">;
  apps: readonly App[];
  /** Served since the window opened, answering from the app's state from here on. */
  shellContract: ShellSource;
  /** Meru Pro's calls, which the trial-ended screen made before the app started. */
  launchHandlers: LaunchHandlers;
  pro: () => ShellState["pro"];
  onProChange: (listener: () => void) => void;
  /** Whether the trial footer shows below the page. */
  trialFooter: () => boolean;
  shell: ReturnType<typeof createShellWindow>;
  profiles: Profiles;
  views: ReturnType<typeof createTabViews>;
  ownWindows: OwnWindows;
  overlays: Overlays;
  find: Find;
  updateCard: UpdateCardModule;
  focus: Focus;
  sidebar: Sidebar;
  inbox: Inbox;
  downloads: Downloads;
  screenPicker: ScreenPicker;
  profileQuestion: ProfileQuestion;
  sentCompose: Pick<SentCompose, "undo">;
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
  /** What this run may use; `onProChange` follows a change. */
  can: (capability: Capability) => boolean;
}) => {
  let hints:
    | {
        commands: readonly Command[];
        shortcuts: ShellState["shortcuts"];
        ariaShortcuts: ShellState["ariaShortcuts"];
      }
    | undefined;
  const shortcuts = (commands: readonly Command[]) => {
    if (hints?.commands !== commands) {
      hints = {
        commands,
        shortcuts: shellShortcuts(commands, platform),
        ariaShortcuts: shellShortcuts(commands, platform, true),
      };
    }

    return { shortcuts: hints.shortcuts, ariaShortcuts: hints.ariaShortcuts };
  };
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
    accelerator: keymap.accelerator,
    bookmarks,
    profiles,
    moveToOwnWindow,
    moveToMainWindow,
    isLoaded: (key) => views.status(key).kind !== "unloaded",
    sleepIdleTabs: () => settings.get("sleepIdleTabs"),
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

  shellContract.start({
    handlers: {
      ...createShellHandlers({
        profiles,
        overlays,
        find,
        updateCard,
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
        screenPicker,
        profileQuestion,
        sentCompose,
        openApp,
        bookmarks,
        tabMenu,
        panes: paneResize,
        pageSize: () =>
          contentViewBounds(
            shell.window.getContentAreaSize(),
            { sidebar: sidebar.current(), trialFooter: trialFooter() },
            platform
          ),
        profileMenu,
        openGmail: showGmail.jumpTo,
        window: shell.window,
        sidebar,
        trialFooter,
        focus,
        runCommand: menu.runCommand,
        doNotDisturbItems: menu.doNotDisturbItems,
        log: console.error,
      }),
      ...launchHandlers,
    },
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
            pro: pro(),
            sidebar: { state: sidebar.current() },
            appearance: {
              tint: settings.get("profileTint"),
              buttons: {
                sidebar: can("workspaceApps"),
                newTab: settings.get("titlebarNewTab"),
                unifiedInbox: settings.get("titlebarUnifiedInbox"),
                downloads: settings.get("titlebarDownloads"),
                doNotDisturb: settings.get("titlebarDoNotDisturb"),
              },
            },
            ...shortcuts(keymap.commands()),
            navigation: views.navigation(),
            downloads: downloads.shellSlice(),
            screenPicker: screenPicker.mainCard() ?? null,
            windows: views.windowTabs().flatMap((key) => {
              const tab = findTab(profiles.get(), key);
              const navigation = views.navigation(key);
              const bar = find.bar(key);
              const downloadsIn = downloads.window();
              const card = screenPicker.windowCard(key);
              const request = screenPicker.windowRequest(key);
              const picker =
                card && request !== undefined
                  ? { picker: card, request }
                  : undefined;

              return tab && navigation
                ? [
                    {
                      ...key,
                      app: tab.app,
                      title: tab.title,
                      status: shellTabStatus(views.status(key)),
                      navigation,
                      bookmarked: bookmarks.bookmarked(key) ?? null,
                      card: ownWindowCard(picker, downloadsIn, key),
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
        onProChange(listener);
        profiles.onChange(listener);
        mail.onChange(listener);
        views.onChange(listener);
        overlays.onChange(listener);
        find.onChange(listener);
        inbox.onChange(listener);
        downloads.onChange(listener);
        screenPicker.onChange(listener);
        sidebar.onChange(listener);
        keymap.onChange(listener);
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
  });
};
