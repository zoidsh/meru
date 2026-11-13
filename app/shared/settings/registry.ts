import type {
  KeyOf,
  ProfileKeyOf,
  SettingsLayers,
  ValueOf,
} from "../../core/engines/settings.ts";
import { appearanceSettings } from "../../main/features/appearance/settings.ts";
import { shortcutsSettings } from "../../main/features/shortcuts/settings.ts";
import { stageSettings } from "../../main/features/stage/settings.ts";
import { updaterSettings } from "../../main/features/updater/settings.ts";
import type { Setting } from "./define.ts";

// Every feature's settings.ts, assembled here and nowhere else.
export const registry = [
  ...appearanceSettings,
  ...shortcutsSettings,
  ...stageSettings,
  ...updaterSettings,
] as const satisfies readonly Setting[];

export type Registry = typeof registry;

export type SettingKey = KeyOf<Registry>;

export type ProfileSettingKey = ProfileKeyOf<Registry>;

/** A profile names its layer only for a key a profile may override. */
export type ProfileArg<K extends SettingKey> = K extends ProfileSettingKey
  ? [profileId?: string]
  : [];

export type SettingValue<K extends SettingKey> = ValueOf<Registry, K>;

export type Settings = SettingsLayers<Registry>;
