import { homedir } from "node:os";
import path from "node:path";

import {
  SETTINGS_CALLS,
  SETTINGS_CHANNELS,
  SETTINGS_STATE,
} from "#contract/settings.ts";
import type { BrowsingDataKinds } from "#core/browsing-data.ts";
import type { Platform } from "#core/platform.ts";
import { windowBackground } from "#core/shell-grey.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import type { ContextMenus } from "#platform/context-menu.ts";
import type { Displays } from "#platform/displays.ts";
import type { DownloadFiles } from "#platform/downloads.ts";
import type { Ipc } from "#platform/ipc.ts";
import type { Theme } from "#platform/theme.ts";
import { createWindowFactory } from "#platform/window.ts";

import { serveContract } from "../contract-ipc.ts";
import type { createDoNotDisturb } from "../do-not-disturb.ts";
import { createGeneralPage } from "../general-page.ts";
import type { Language } from "../language.ts";
import type { MailPoller } from "../mail.ts";
import type { Profiles } from "../profiles.ts";
import { createRemoveProfile } from "../remove-profile.ts";
import type { SenderRegistry } from "../senders.ts";
import {
  onSettingsStateChange,
  readSettingsState,
  settingsHandlers,
} from "../settings-contract.ts";
import { createSettingsPages } from "../settings-pages.ts";
import { createSettingsWindow } from "../settings-window.ts";
import type { SettingsStore } from "../settings.ts";
import { createRendererRecovery } from "../shell-recovery.ts";
import type { SoundOutput } from "../sounds.ts";
import type { Spellcheck } from "../spellcheck.ts";
import { openingOptions } from "../windows.ts";
import { folderPicker, systemLoginItem } from "./test-build.ts";

/** As the approved prototype draws it. */
const SETTINGS_SIZE = { width: 800, height: 600 };

/**
 * The Settings window, opened by the `app.settings` command, and the
 * contract its page reads and writes the app's settings and Do Not Disturb
 * through.
 */
export const wireSettingsWindow = ({
  platform,
  downloadFiles,
  isMacOS,
  background,
  lifecycle,
  contextMenus,
  displays,
  theme,
  url,
  origin,
  language,
  spellcheck,
  ipc,
  senders,
  settings,
  profiles,
  addProfile,
  mail,
  doNotDisturb,
  sound,
  showTestNotification,
  deleteBrowsingData,
  signIn,
}: {
  platform: Platform;
  /** The downloads' own, for the folder they are saved to. */
  downloadFiles: Pick<DownloadFiles, "systemFolder" | "usable">;
  isMacOS: boolean;
  background: boolean;
  lifecycle: ReturnType<typeof createAppLifecycle>;
  contextMenus: ContextMenus;
  displays: Displays;
  theme: Theme;
  /** The Settings page, its language named in the query. */
  url: () => string;
  origin: string;
  language: Language;
  /** None on macOS, which checks spelling with its own. */
  spellcheck: Spellcheck | undefined;
  ipc: Ipc;
  senders: SenderRegistry;
  settings: SettingsStore;
  profiles: Profiles;
  /** Adds a profile and selects it, as every other way to add one does. */
  addProfile: () => Promise<string | undefined>;
  mail: MailPoller;
  doNotDisturb: ReturnType<typeof createDoNotDisturb>;
  sound: Pick<SoundOutput, "play">;
  showTestNotification: (profileId: string | undefined) => void;
  deleteBrowsingData: (
    profileId: string,
    kinds: BrowsingDataKinds
  ) => Promise<void>;
  signIn: (profileId: string) => Promise<void>;
}) => {
  const windows = createWindowFactory(contextMenus);
  const pages = createSettingsPages();

  const settingsWindow = createSettingsWindow({
    create: () =>
      windows.create({
        ...openingOptions({
          displays,
          saved: undefined,
          defaultSize: SETTINGS_SIZE,
          minimumSize: SETTINGS_SIZE,
          title: lifecycle.name,
          isMacOS,
          backgroundColor: windowBackground(theme.isDark()),
        }),
        preloadPath: path.join(import.meta.dirname, "preload-settings.cjs"),
        contentUrl: url(),
        isShellDocument: () => false,
      }),
    url,
    background,
    register: (webContentsId) =>
      senders.register(webContentsId, { role: "settings" }),
    prepare: (window) => {
      pages.reset();
      createRendererRecovery({
        window,
        name: "The Settings window's renderer",
        now: Date.now,
        giveUp: window.destroy,
        log: console.error,
      });
    },
    log: console.error,
  });

  const picker = folderPicker();
  const general = createGeneralPage({
    platform,
    loginItem: systemLoginItem(),
    settings,
    files: downloadFiles,
    home: homedir(),
    // As a sheet on the Settings window, which asked.
    pickFolder: (defaultPath) => {
      const window = settingsWindow.current();

      return window
        ? picker.pick(window, defaultPath)
        : Promise.reject(new Error("The Settings window is not open"));
    },
    language,
    spellcheck,
  });

  profiles.onChange(() => {
    pages.follow(profiles.get().profiles.map((profile) => profile.id));
  });

  theme.onChange(() => {
    settingsWindow
      .current()
      ?.setBackgroundColor(windowBackground(theme.isDark()));
  });

  serveContract({
    ipc,
    senders,
    role: "settings",
    surface: "Settings window",
    origin,
    calls: SETTINGS_CALLS,
    slices: SETTINGS_STATE,
    channels: SETTINGS_CHANNELS,
    handlers: settingsHandlers({
      settings,
      profiles,
      addProfile,
      mail,
      doNotDisturb,
      language,
      sound,
      pages,
      showTestNotification,
      deleteBrowsingData,
      signIn,
      general,
      // The system's confirmation shows as a sheet on the window that asked.
      removeProfile: async (profileId) => {
        const window = settingsWindow.current();

        if (window) {
          await createRemoveProfile({ profiles, window, log: console.error })(
            profileId
          );
        }
      },
    }),
    state: {
      read: () =>
        readSettingsState({
          settings,
          profiles,
          mail,
          doNotDisturb,
          pages,
          general,
          language,
        }),
      onChange: (listener) => {
        onSettingsStateChange(
          { settings, profiles, mail, pages, general, language },
          listener
        );
      },
    },
    log: console.error,
  });

  return {
    openSettings: settingsWindow.open,
    settingsFocused: settingsWindow.isFocused,
    onSettingsFocusChange: settingsWindow.onFocusChange,
    settingsPages: pages,
  };
};
