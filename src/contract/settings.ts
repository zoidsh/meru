import { z } from "zod/mini";

import { OVERRIDABLE_SETTING_KEYS, SETTINGS } from "#core/settings.ts";
import type { OverridableSettingKey, SettingValue } from "#core/settings.ts";

import type {
  ContractBridge,
  ContractCalls,
  ContractState,
  SyncMessage,
} from "./contract.ts";
import type { SettingsCallName } from "./settings-channels.ts";

export { SETTINGS_CALL_NAMES, SETTINGS_CHANNELS } from "./settings-channels.ts";

/**
 * The settings the Notifications page edits: those a profile may hold a
 * value of its own for, every one of them a notification's or the badge's.
 */
export const PAGE_SETTING_KEYS = OVERRIDABLE_SETTING_KEYS;

export type PageSettingKey = OverridableSettingKey;

export type PageSettings = {
  [Key in PageSettingKey]: SettingValue<Key>;
};

/** One setting's new app value, the key naming which schema checks it. */
export type SettingChange = {
  [Key in PageSettingKey]: { key: Key; value: SettingValue<Key> };
}[PageSettingKey];

const schemaOf = (key: PageSettingKey) =>
  SETTINGS[key].schema as z.ZodMiniType<unknown>;

const settingChange = z.union(
  PAGE_SETTING_KEYS.map((key) =>
    z.object({ key: z.literal(key), value: schemaOf(key) })
  )
) as unknown as z.ZodMiniType<SettingChange>;

const pageSettings = z.object(
  Object.fromEntries(PAGE_SETTING_KEYS.map((key) => [key, schemaOf(key)]))
) as unknown as z.ZodMiniType<PageSettings>;

/** Each call the Settings window may make, with what main accepts of it. */
export const SETTINGS_CALLS = {
  /** Sets the app value of one of the page's settings. */
  update: { request: settingChange, response: z.undefined() },
  /** Turns Do Not Disturb on until turned off, or off. */
  setDoNotDisturb: {
    request: z.object({ on: z.boolean() }),
    response: z.undefined(),
  },
} as const satisfies Record<
  SettingsCallName,
  { request: z.ZodMiniType; response: z.ZodMiniType }
>;

/** The slices of main's state the Settings window may subscribe to. */
export const SETTINGS_STATE = {
  /** The app value of each of the page's settings. */
  settings: pageSettings,
  /** Whether Do Not Disturb holds, and until when: `null` for until turned off. */
  doNotDisturb: z.object({
    on: z.boolean(),
    until: z.nullable(z.number()),
  }),
  /** How many profiles there are, since some rows show only with two or more. */
  profileCount: z.int().check(z.nonnegative()),
} as const;

export type SettingsCalls = ContractCalls<typeof SETTINGS_CALLS>;

export type SettingsSliceName = keyof typeof SETTINGS_STATE;

export type SettingsState = ContractState<typeof SETTINGS_STATE>;

export type SettingsSyncMessage = SyncMessage<SettingsState>;

/** What the Settings window's preload exposes on `window.meru`, and nothing else. */
export type SettingsBridge = ContractBridge<SettingsCalls, SettingsState>;
