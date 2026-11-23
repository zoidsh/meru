import { z } from "zod/mini";

import { MAIL_STATUSES } from "#core/feed.ts";
import { PROFILE_COLOR_NAMES } from "#core/profile-color.ts";
import { SAVED_SEARCH_REFUSALS } from "#core/saved-searches.ts";
import { SETTINGS_SECTIONS } from "#core/settings-pages.ts";
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

const none = z.object({});

const searchId = z.string().check(z.minLength(1));

const page = z.object({
  section: z.enum(SETTINGS_SECTIONS),
  /** A profile's page inside Profiles, else `null` for the section itself. */
  profileId: z.nullable(profileId),
});

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
  /**
   * Shows a stand-in for new mail as a listed profile's settings show it, or
   * the app's for `null`, whatever quiet hours or a setting say; refused
   * while Do Not Disturb holds.
   */
  showTestNotification: {
    request: z.object({ profileId: z.nullable(profileId) }),
    response: z.undefined(),
  },
  /**
   * Shows a page after the one shown, dropping those ahead; a profile's page
   * only for a listed profile, inside Profiles.
   */
  openPage: { request: page, response: z.undefined() },
  /** One page back, as the menu's Back does with the window focused. */
  goBack: { request: none, response: z.undefined() },
  goForward: { request: none, response: z.undefined() },
  /**
   * Adds a profile, selected in the main window, and shows its page;
   * answers its id.
   */
  addProfile: { request: none, response: profileId },
  /** By core's rules: trimmed, and empty or too long changes nothing. */
  renameProfile: {
    request: z.object({ profileId, name: z.string() }),
    response: z.undefined(),
  },
  setProfileColor: {
    request: z.object({ profileId, color: z.enum(PROFILE_COLOR_NAMES) }),
    response: z.undefined(),
  },
  /** To a place in the titlebar's order, counted from 0. */
  moveProfile: {
    request: z.object({ profileId, toIndex: z.int().check(z.gte(0)) }),
    response: z.undefined(),
  },
  /**
   * Asks with the system's confirmation on the Settings window, and removes
   * the profile once confirmed; refused for the last profile.
   */
  removeProfile: { request: z.object({ profileId }), response: z.undefined() },
  /** Turns a listed profile's Check mail on or off. */
  setCheckMail: {
    request: z.object({ profileId, on: z.boolean() }),
    response: z.undefined(),
  },
  /**
   * Puts a listed profile to sleep, refused for the last awake one, or wakes
   * it by selecting it in the main window, as every way to it does.
   */
  setAsleep: {
    request: z.object({ profileId, asleep: z.boolean() }),
    response: z.undefined(),
  },
  /**
   * Adds a search last in a listed profile's list, named when `name` is not
   * empty; answers why it cannot be added, else `null`.
   */
  addSavedSearch: {
    request: z.object({ profileId, query: z.string(), name: z.string() }),
    response: z.nullable(z.enum(SAVED_SEARCH_REFUSALS)),
  },
  /** By core's rules: trimmed, and empty clears the name. */
  renameSavedSearch: {
    request: z.object({ profileId, searchId, name: z.string() }),
    response: z.undefined(),
  },
  /** At once, asking nothing. */
  removeSavedSearch: {
    request: z.object({ profileId, searchId }),
    response: z.undefined(),
  },
  /**
   * Turns a listed profile on or off; refused for the last enabled one, and
   * turning off the selected one selects another.
   */
  setProfileEnabled: {
    request: z.object({ profileId, enabled: z.boolean() }),
    response: z.undefined(),
  },
  /**
   * Deletes a listed profile's cookies and other site data, its cache, or
   * both; refused with neither. Rejects when they could not be deleted.
   */
  deleteBrowsingData: {
    request: z.object({
      profileId,
      cookies: z.boolean(),
      cache: z.boolean(),
    }),
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
      /** Which of the eight that is. */
      colorName: z.enum(PROFILE_COLOR_NAMES),
      /** `false` while turned off, with no pages, mail or place in the titlebar. */
      enabled: z.boolean(),
      asleep: z.boolean(),
      checkMail: z.boolean(),
      /**
       * Where its feed stands, and the signed-in account's address once a
       * feed has given it, `null` before that and once signed out.
       */
      mail: z.object({
        status: z.enum(MAIL_STATUSES),
        address: z.nullable(z.string()),
      }),
      /** Its saved searches that read, in their order; `name` `null` for none. */
      savedSearches: z.array(
        z.object({
          id: searchId,
          query: z.string(),
          name: z.nullable(z.string()),
        })
      ),
      overrides: pageOverrides,
    })
  ),
  /** The page shown, and whether Back and Forward have one to go to. */
  page: z.object({
    ...page.shape,
    canGoBack: z.boolean(),
    canGoForward: z.boolean(),
  }),
} as const;

export type SettingsCalls = ContractCalls<typeof SETTINGS_CALLS>;

export type SettingsSliceName = keyof typeof SETTINGS_STATE;

export type SettingsState = ContractState<typeof SETTINGS_STATE>;

export type SettingsSyncMessage = SyncMessage<SettingsState>;

/** What the Settings window's preload exposes on `window.meru`, and nothing else. */
export type SettingsBridge = ContractBridge<SettingsCalls, SettingsState>;
