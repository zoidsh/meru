import path from "node:path";

import {
  PAGE_SETTING_KEYS,
  SETTINGS_CALLS,
  SETTINGS_CHANNELS,
  SETTINGS_STATE,
} from "#contract/settings.ts";
import type {
  PageSettingKey,
  PageSettings,
  SettingChange,
} from "#contract/settings.ts";
import { UNTIL_OFF } from "#core/notification-gate.ts";
import { windowBackground } from "#core/shell-grey.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import type { ContextMenus } from "#platform/context-menu.ts";
import type { Displays } from "#platform/displays.ts";
import type { Ipc } from "#platform/ipc.ts";
import type { Theme } from "#platform/theme.ts";
import { createWindowFactory } from "#platform/window.ts";

import { serveContract } from "../contract-ipc.ts";
import type { createDoNotDisturb } from "../do-not-disturb.ts";
import type { Profiles } from "../profiles.ts";
import type { SenderRegistry } from "../senders.ts";
import { createSettingsWindow } from "../settings-window.ts";
import type { SettingsStore } from "../settings.ts";
import { createRendererRecovery } from "../shell-recovery.ts";
import { openingOptions } from "../windows.ts";

/** As the approved prototype draws it. */
const SETTINGS_SIZE = { width: 800, height: 600 };

/** Sets one setting's app value, the key and value checked together. */
const applyChange = (settings: SettingsStore, { key, value }: SettingChange) =>
  (
    settings.update as (
      key: PageSettingKey,
      change: () => SettingChange["value"]
    ) => Promise<void>
  )(key, () => value);

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
  doNotDisturb,
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
  doNotDisturb: ReturnType<typeof createDoNotDisturb>;
}) => {
  const windows = createWindowFactory(contextMenus);

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
    handlers: {
      update: (change) => applyChange(settings, change as SettingChange),
      // On from here holds until turned off; the durations are the
      // titlebar's.
      setDoNotDisturb: ({ on }) =>
        on ? doNotDisturb.switchOn(UNTIL_OFF) : doNotDisturb.switchOff(),
    },
    state: {
      read: () => {
        const current = doNotDisturb.current();

        return {
          settings: Object.fromEntries(
            PAGE_SETTING_KEYS.map((key) => [key, settings.get(key)])
          ) as PageSettings,
          doNotDisturb: {
            on: current !== undefined,
            until: current?.until ?? null,
          },
          profileCount: profiles.get().profiles.length,
        };
      },
      onChange: (listener) => {
        for (const key of PAGE_SETTING_KEYS) {
          settings.onChange(key, listener);
        }

        profiles.onChange(listener);
      },
    },
    log: console.error,
  });

  return {
    openSettings: settingsWindow.open,
    settingsFocused: settingsWindow.isFocused,
    onSettingsFocusChange: settingsWindow.onFocusChange,
  };
};
