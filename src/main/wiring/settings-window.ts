import path from "node:path";

import {
  PAGE_SETTING_KEYS,
  SETTINGS_CALLS,
  SETTINGS_CHANNELS,
  SETTINGS_STATE,
} from "#contract/settings.ts";
import { windowBackground } from "#core/shell-grey.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import type { ContextMenus } from "#platform/context-menu.ts";
import type { Displays } from "#platform/displays.ts";
import type { Ipc } from "#platform/ipc.ts";
import type { Theme } from "#platform/theme.ts";
import { createWindowFactory } from "#platform/window.ts";

import { serveContract } from "../contract-ipc.ts";
import type { createDoNotDisturb } from "../do-not-disturb.ts";
import type { MailPoller } from "../mail.ts";
import type { Profiles } from "../profiles.ts";
import { createRemoveProfile } from "../remove-profile.ts";
import type { SenderRegistry } from "../senders.ts";
import { readSettingsState, settingsHandlers } from "../settings-contract.ts";
import { createSettingsPages } from "../settings-pages.ts";
import { createSettingsWindow } from "../settings-window.ts";
import type { SettingsStore } from "../settings.ts";
import { createRendererRecovery } from "../shell-recovery.ts";
import type { SoundOutput } from "../sounds.ts";
import { openingOptions } from "../windows.ts";

/** As the approved prototype draws it. */
const SETTINGS_SIZE = { width: 800, height: 600 };

/**
 * The Settings window, opened by the `app.settings` command, and the
 * contract its page reads and writes the app's settings and Do Not Disturb
 * through.
 */
export const wireSettingsWindow = ({
  isMacOS,
  background,
  lifecycle,
  contextMenus,
  displays,
  theme,
  url,
  origin,
  ipc,
  senders,
  settings,
  profiles,
  addProfile,
  mail,
  doNotDisturb,
  sound,
  showTestNotification,
}: {
  isMacOS: boolean;
  background: boolean;
  lifecycle: ReturnType<typeof createAppLifecycle>;
  contextMenus: ContextMenus;
  displays: Displays;
  theme: Theme;
  /** The Settings page, its language named in the query. */
  url: string;
  origin: string;
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
        contentUrl: url,
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
      sound,
      pages,
      showTestNotification,
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
        readSettingsState({ settings, profiles, mail, doNotDisturb, pages }),
      onChange: (listener) => {
        for (const key of PAGE_SETTING_KEYS) {
          settings.onChange(key, listener);
        }

        profiles.onChange(listener);
        mail.onChange(listener);
        pages.onChange(listener);
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
