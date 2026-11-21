import { z } from "zod/mini";

import { OVERRIDABLE_SETTING_KEYS, SETTINGS } from "#core/settings.ts";
import type { OverridableSettingKey, SettingValue } from "#core/settings.ts";
import { NOTIFICATION_SOUNDS } from "#core/sounds.ts";

import type {
  ContractBridge,
  ContractCalls,
  ContractState,
  SyncMessage,
} from "./contract.ts";
import type { SettingsCallName } from "./settings-channels.ts";

export { SETTINGS_CALL_NAMES, SETTINGS_CHANNELS } from "./settings-channels.ts";

/** The page's settings that only the app holds, never a profile. */
const APP_ONLY_PAGE_KEYS = ["notificationSoundVolume"] as const;

/**
 * The settings the Notifications page edits: those a profile may hold a
 * value of its own for, every one of them a notification's or the badge's,
 * and the app-only ones.
 */
export const PAGE_SETTING_KEYS = [
  ...OVERRIDABLE_SETTING_KEYS,
  ...APP_ONLY_PAGE_KEYS,
];

export type PageSettingKey =
  | OverridableSettingKey
  | (typeof APP_ONLY_PAGE_KEYS)[number];

export type PageSettings = {
  [Key in PageSettingKey]: SettingValue<Key>;
};

/** The values a profile holds of its own, of the page's settings. */
export type PageOverrides = Partial<Pick<PageSettings, OverridableSettingKey>>;

type ChangeOf<Keys extends PageSettingKey> = {
  [Key in Keys]: { key: Key; value: SettingValue<Key> };
}[Keys];

/** One setting's new app value, the key naming which schema checks it. */
export type SettingChange = ChangeOf<PageSettingKey>;

/** One setting's new value of the profile's own. */
export type OverrideChange = ChangeOf<OverridableSettingKey> & {
  profileId: string;
};

const profileId = z.string().check(z.minLength(1));

const schemaOf = (key: PageSettingKey) =>
  SETTINGS[key].schema as z.ZodMiniType<unknown>;

const settingChange = z.union(
  PAGE_SETTING_KEYS.map((key) =>
    z.object({ key: z.literal(key), value: schemaOf(key) })
  )
) as unknown as z.ZodMiniType<SettingChange>;

const overrideChange = z.union(
  OVERRIDABLE_SETTING_KEYS.map((key) =>
    z.object({ profileId, key: z.literal(key), value: schemaOf(key) })
  )
) as unknown as z.ZodMiniType<OverrideChange>;

const shapeOf = (keys: readonly PageSettingKey[]) =>
  Object.fromEntries(keys.map((key) => [key, schemaOf(key)]));

const pageSettings = z.object(
  shapeOf(PAGE_SETTING_KEYS)
) as unknown as z.ZodMiniType<PageSettings>;

const pageOverrides = z.partial(
  z.object(shapeOf(OVERRIDABLE_SETTING_KEYS))
) as unknown as z.ZodMiniType<PageOverrides>;

/** Each call the Settings window may make, with what main accepts of it. */
export const SETTINGS_CALLS = {
  /** Sets the app value of one of the page's settings. */
  update: { request: settingChange, response: z.undefined() },
  /**
   * Sets a listed profile's own value of one of the page's settings, even
   * one equal to the app's.
   */
  setOverride: { request: overrideChange, response: z.undefined() },
  /** Deletes a listed profile's own value, so it reads the app's again. */
  clearOverride: {
    request: z.object({
      profileId,
      key: z.enum(
        OVERRIDABLE_SETTING_KEYS as [
          OverridableSettingKey,
          ...OverridableSettingKey[],
        ]
      ),
    }),
    response: z.undefined(),
  },
  /** Turns Do Not Disturb on until turned off, or off. */
  setDoNotDisturb: {
    request: z.object({ on: z.boolean() }),
    response: z.undefined(),
  },
  /**
   * Plays one of Meru's sounds once at the app's volume, as a notification's
   * would, even while Do Not Disturb or quiet hours hold.
   */
  previewSound: {
    request: z.object({ sound: z.enum(NOTIFICATION_SOUNDS) }),
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
  /**
   * The profiles, in the titlebar's order, each with the values of the
   * page's settings it holds of its own that parse.
   */
  profiles: z.array(
    z.object({
      id: profileId,
      name: z.string(),
      /** As the shell draws its dot. */
      color: z.string(),
      overrides: pageOverrides,
    })
  ),
} as const;

export type SettingsCalls = ContractCalls<typeof SETTINGS_CALLS>;

export type SettingsSliceName = keyof typeof SETTINGS_STATE;

export type SettingsState = ContractState<typeof SETTINGS_STATE>;

export type SettingsSyncMessage = SyncMessage<SettingsState>;

/** What the Settings window's preload exposes on `window.meru`, and nothing else. */
export type SettingsBridge = ContractBridge<SettingsCalls, SettingsState>;
