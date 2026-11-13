import { sortBy } from "es-toolkit";
import type { z } from "zod";

import type {
  KeyOf,
  ProfileKeyOf,
  SettingScope,
  SettingsLayers,
  ValueOf,
} from "../../core/engines/settings.ts";
import {
  appearancePage,
  appearanceSettings,
} from "../../main/features/appearance/settings.ts";
import { launcherSettings } from "../../main/features/launcher/settings.ts";
import { linksSettings } from "../../main/features/links/settings.ts";
import {
  profilesPage,
  profilesSettings,
} from "../../main/features/profiles/settings.ts";
import {
  shortcutsPage,
  shortcutsSettings,
} from "../../main/features/shortcuts/settings.ts";
import {
  sidebarPage,
  sidebarSettings,
} from "../../main/features/sidebar/settings.ts";
import {
  panesPage,
  stageSettings,
} from "../../main/features/stage/settings.ts";
import {
  updaterSettings,
  updatesPage,
} from "../../main/features/updater/settings.ts";
import { windowsSettings } from "../../main/features/windows/settings.ts";
import type { Setting } from "./define.ts";

const pages = [
  appearancePage,
  panesPage,
  profilesPage,
  shortcutsPage,
  sidebarPage,
  updatesPage,
] as const;

export type SettingsPageId = (typeof pages)[number]["id"];

export type SettingsPageIcon = (typeof pages)[number]["icon"];

/** The settings window's pages, in the order they sit down the left. */
export const settingsPages = sortBy(pages, [(page) => page.order]);

export const registry = [
  ...appearanceSettings,
  ...launcherSettings,
  ...linksSettings,
  ...profilesSettings,
  ...shortcutsSettings,
  ...sidebarSettings,
  ...stageSettings,
  ...updaterSettings,
  ...windowsSettings,
] as const satisfies readonly Setting<
  string,
  z.ZodType,
  SettingScope,
  SettingsPageId
>[];

export type Registry = typeof registry;

export type SettingKey = KeyOf<Registry>;

export type ProfileSettingKey = ProfileKeyOf<Registry>;

/** A profile names its layer only for a key a profile may override. */
export type ProfileArg<K extends SettingKey> = K extends ProfileSettingKey
  ? [profileId?: string]
  : [];

export type SettingValue<K extends SettingKey> = ValueOf<Registry, K>;

export type Settings = SettingsLayers<Registry>;
