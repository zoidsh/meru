import type {
  KeyOf,
  ProfileKeyOf,
  SettingsLayers,
  ValueOf,
} from "../../core/engines/settings.ts";
import type { Setting } from "./define.ts";

// Every feature's settings.ts, assembled here and nowhere else.
export const registry = [] as const satisfies readonly Setting[];

export type Registry = typeof registry;

export type SettingKey = KeyOf<Registry>;

export type ProfileSettingKey = ProfileKeyOf<Registry>;

export type SettingValue<K extends SettingKey> = ValueOf<Registry, K>;

export type Settings = SettingsLayers<Registry>;
