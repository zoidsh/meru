import { z } from "zod/mini";

import { APP_IDS } from "#core/apps.ts";
import { CAPABILITIES } from "#core/entitlement.ts";
import { MAIL_STATUSES } from "#core/feed.ts";
import { PROFILE_COLOR_NAMES } from "#core/profile-color.ts";
import { SAVED_SEARCH_REFUSALS } from "#core/saved-searches.ts";
import { SETTINGS_SECTIONS } from "#core/settings-pages.ts";
import { OVERRIDABLE_SETTING_KEYS, SETTINGS } from "#core/settings.ts";
import type { OverridableSettingKey, SettingValue } from "#core/settings.ts";
import { NOTIFICATION_SOUNDS } from "#core/sounds.ts";
import { UPDATE_STATUSES } from "#core/updates.ts";

import type {
  ContractBridge,
  ContractCalls,
  ContractState,
  SyncMessage,
} from "./contract.ts";
import { ENTITLEMENT_CALLS, ENTITLEMENT_STATE } from "./entitlement.ts";
import type { SettingsCallName } from "./settings-channels.ts";

export { SETTINGS_CALL_NAMES, SETTINGS_CHANNELS } from "./settings-channels.ts";

/** The Gmail page's settings, in its order; the app holds them, never a profile. */
export const GMAIL_PAGE_KEYS = [
  "hidePromoBanner",
  "hideUpgradeButton",
  "hideInboxFooter",
  "extendDarkTheme",
  "reverseConversation",
  "moveAttachmentsToTop",
  "showTrimmedContent",
  "verificationCodes",
  "verificationCodesDuringDoNotDisturb",
  "verificationCodeCopyMode",
  "verificationCodeMarkRead",
  "verificationCodeTrash",
] as const;

/**
 * The General page's settings, in its order; the app holds them, never a
 * profile. Open at login is the system's login item, not a setting.
 */
export const GENERAL_PAGE_KEYS = [
  "language",
  "spellcheckLanguages",
  "openInBackground",
  "downloadsSaveAs",
  "downloadsShowInFolder",
] as const;

/** The Appearance page's settings, in its order; the app holds them, never a profile. */
export const APPEARANCE_PAGE_KEYS = [
  "theme",
  "profileTint",
  "profileTintStrength",
  "titlebarNewTab",
  "titlebarUnifiedInbox",
  "titlebarDownloads",
  "titlebarDoNotDisturb",
] as const;

/**
 * The Menu Bar & Dock page's settings, in its order on macOS; the app holds
 * them, never a profile. `dockIcon` and `trayUnreadCount` are read on macOS
 * alone, `trayIconColor` on Windows and Linux.
 */
export const MENU_BAR_PAGE_KEYS = [
  "dockIcon",
  "tray",
  "trayUnreadCount",
  "trayIconColor",
  "trayJumpsToUnread",
] as const;

/**
 * The Privacy & Security page's settings, in its order; the app holds them,
 * never a profile. The trusted sites are a list the page changes one site at
 * a time, never a setting it writes.
 */
export const PRIVACY_PAGE_KEYS = [
  "blockAds",
  "blockTrackers",
  "confirmLinks",
] as const;

/**
 * The Tabs & Google Apps page's settings a profile may hold a value of its
 * own for, in its order.
 */
export const TABS_APPS_OVERRIDABLE_KEYS = [
  "openAppsInMeru",
  "appsInDefaultBrowser",
] as const;

/**
 * The Tabs & Google Apps page's other settings, in its order, after those;
 * the app holds them, never a profile.
 */
export const TABS_APPS_PAGE_KEYS = ["sleepIdleTabs", "sleepAfter"] as const;

/** The General page's setting a profile may hold a value of its own for. */
export const GENERAL_OVERRIDABLE_KEYS = ["downloadsFolder"] as const;

/** What the About page shows and copies, as its slice names them. */
export const ABOUT_ITEMS = ["version", "operatingSystem"] as const;

export type AboutItem = (typeof ABOUT_ITEMS)[number];

/** The About page's settings, in its order; the app holds them, never a profile. */
export const ABOUT_PAGE_KEYS = ["autoUpdate", "updateChannel"] as const;

/** The Advanced page's settings; the app holds them, never a profile. */
export const ADVANCED_PAGE_KEYS = [
  "hardwareAcceleration",
  "systemScreenPicker",
] as const;

/**
 * The settings a profile may hold a value of its own for, as the pages show
 * them. `unifiedInbox` is a profile's own switch on its page instead, so it
 * never counts as one of a page's overrides.
 */
export type PageOverridableKey = Exclude<OverridableSettingKey, "unifiedInbox">;

export const PAGE_OVERRIDABLE_KEYS = OVERRIDABLE_SETTING_KEYS.filter(
  (key): key is PageOverridableKey => key !== "unifiedInbox"
);

const ELSEWHERE = new Set<PageOverridableKey>([
  ...TABS_APPS_OVERRIDABLE_KEYS,
  ...GENERAL_OVERRIDABLE_KEYS,
]);

/** The Notifications page's settings a profile may hold a value of its own for. */
export const NOTIFICATIONS_OVERRIDABLE_KEYS = PAGE_OVERRIDABLE_KEYS.filter(
  (key) => !ELSEWHERE.has(key)
);

/**
 * Set only through the system's folder picker, so a page can never name a
 * folder downloads are written to.
 */
type PickedKey = (typeof GENERAL_OVERRIDABLE_KEYS)[number];

const isWritten = <Key extends PageSettingKey>(
  key: Key
): key is Exclude<Key, PickedKey> => key !== "downloadsFolder";

/** The pages' settings that only the app holds, never a profile. */
const APP_ONLY_PAGE_KEYS = [
  "notificationSoundVolume",
  ...GMAIL_PAGE_KEYS,
  ...TABS_APPS_PAGE_KEYS,
  ...GENERAL_PAGE_KEYS,
  ...APPEARANCE_PAGE_KEYS,
  ...MENU_BAR_PAGE_KEYS,
  ...PRIVACY_PAGE_KEYS,
  ...ADVANCED_PAGE_KEYS,
  ...ABOUT_PAGE_KEYS,
] as const;

/**
 * The settings the window's pages edit: those a profile may hold a value of
 * its own for, every one of them a notification's or the badge's, and the
 * app-only ones.
 */
export const PAGE_SETTING_KEYS = [
  ...PAGE_OVERRIDABLE_KEYS,
  ...APP_ONLY_PAGE_KEYS,
];

export type PageSettingKey =
  | PageOverridableKey
  | (typeof APP_ONLY_PAGE_KEYS)[number];

export type PageSettings = {
  [Key in PageSettingKey]: SettingValue<Key>;
};

/** The values a profile holds of its own, of the page's settings. */
export type PageOverrides = Partial<Pick<PageSettings, PageOverridableKey>>;

type ChangeOf<Keys extends PageSettingKey> = {
  [Key in Keys]: { key: Key; value: SettingValue<Key> };
}[Keys];

/** One setting's new app value, the key naming which schema checks it. */
export type SettingChange = ChangeOf<Exclude<PageSettingKey, PickedKey>>;

/** One setting's new value of the profile's own. */
export type OverrideChange = ChangeOf<
  Exclude<PageOverridableKey, PickedKey>
> & {
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
  PAGE_SETTING_KEYS.filter(isWritten).map((key) =>
    z.object({ key: z.literal(key), value: schemaOf(key) })
  )
) as unknown as z.ZodMiniType<SettingChange>;

const overrideChange = z.union(
  PAGE_OVERRIDABLE_KEYS.filter(isWritten).map((key) =>
    z.object({ profileId, key: z.literal(key), value: schemaOf(key) })
  )
) as unknown as z.ZodMiniType<OverrideChange>;

const shapeOf = (keys: readonly PageSettingKey[]) =>
  Object.fromEntries(keys.map((key) => [key, schemaOf(key)]));

const pageSettings = z.object(
  shapeOf(PAGE_SETTING_KEYS)
) as unknown as z.ZodMiniType<PageSettings>;

const pageOverrides = z.partial(
  z.object(shapeOf(PAGE_OVERRIDABLE_KEYS))
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
        PAGE_OVERRIDABLE_KEYS as [PageOverridableKey, ...PageOverridableKey[]]
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
   * Lists a listed profile's mail in the Unified inbox or leaves it out: its
   * own `unifiedInbox` while that differs from the app value, which no page
   * shows, and none once they are equal.
   */
  setUnifiedInbox: {
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
  /**
   * Selects a listed profile in the main window, waking it, and shows its
   * Gmail tab, where Google's sign-in is; refused for one turned off.
   */
  signIn: {
    request: z.object({ profileId }),
    response: z.undefined(),
  },
  /** Makes Meru one of the system's login items, or not; refused on Linux. */
  setOpenAtLogin: {
    request: z.object({ on: z.boolean() }),
    response: z.undefined(),
  },
  /**
   * Makes Meru the system's handler for email links, or gives them back, on
   * macOS and Linux; refused on Windows, off on Linux, and without Meru Pro.
   */
  setEmailLinks: {
    request: z.object({ on: z.boolean() }),
    response: z.undefined(),
  },
  /**
   * Opens Windows Settings at Default apps, where Meru is chosen for email
   * links; refused elsewhere and without Meru Pro.
   */
  openDefaultApps: { request: none, response: z.undefined() },
  /**
   * Opens the system's folder picker on the Settings window at the folder in
   * use and saves downloads to the folder chosen: the app's for `null`,
   * else a listed profile's own; a cancel changes nothing.
   */
  chooseDownloadsFolder: {
    request: z.object({ profileId: z.nullable(profileId) }),
    response: z.undefined(),
  },
  /**
   * Checks spelling in the language too, or no longer, applied to the list
   * as stored when main gets to it; refused on macOS.
   */
  setSpellcheckLanguage: {
    request: z.object({ code: z.string(), on: z.boolean() }),
    response: z.undefined(),
  },
  /**
   * Opens the app in the default browser too, or no longer, applied to the
   * list as stored when main gets to it: the app's for `null`, else a listed
   * profile's own, which starts from the app's list when it has none yet.
   * Refused for Gmail.
   */
  setAppInDefaultBrowser: {
    request: z.object({
      profileId: z.nullable(profileId),
      app: z.enum(APP_IDS),
      on: z.boolean(),
    }),
    response: z.undefined(),
  },
  /**
   * Stops trusting one site, applied to the list as stored when main gets
   * to it; a site not listed changes nothing.
   */
  removeTrustedSite: {
    request: z.object({ site: z.string() }),
    response: z.undefined(),
  },
  /**
   * Opens `settings.json` in the system's handler, saved first when there is
   * no file yet; a failure is logged, never answered.
   */
  openSettingsFile: { request: none, response: z.undefined() },
  /**
   * Clears the cache alone of every stored profile and reloads each one's
   * pages; rejects when any could not be cleared.
   */
  clearCache: { request: none, response: z.undefined() },
  /** Puts main's own string of one of the About page's values on the clipboard. */
  copyAboutValue: {
    request: z.object({ item: z.enum(ABOUT_ITEMS) }),
    response: z.undefined(),
  },
  /**
   * Checks for a new version now, whatever the automatic check says; none is
   * started beside one that runs, nor where the build cannot update itself.
   */
  checkForUpdates: { request: none, response: z.undefined() },
  /**
   * Saves what quit saves, then quits and installs the version downloaded,
   * relaunching after; nothing while none is ready.
   */
  restartToUpdate: { request: none, response: z.undefined() },
  /**
   * Opens the release page of the version that could not be verified in the
   * default browser; nothing while none was refused.
   */
  openUpdateRelease: { request: none, response: z.undefined() },
  /** Opens the list of Meru's releases, each with its notes, in the default browser. */
  openWhatsNew: { request: none, response: z.undefined() },
  /**
   * Opens an email to Meru's support about the license, from the selected
   * profile's Gmail, or the system's mail app while that profile is signed out.
   */
  contactSupport: { request: none, response: z.undefined() },
  ...ENTITLEMENT_CALLS,
} as const satisfies Record<
  SettingsCallName,
  { request: z.ZodMiniType; response: z.ZodMiniType }
>;

const downloadsFolderShown = z.object({
  path: z.string(),
  available: z.boolean(),
});

const shortcutKey = z.object({
  /** One per key, in the platform's order and symbols: `⇧` `⌘` `G`. */
  parts: z.array(z.string()),
  /** The keys as a screen reader says them: `Shift Command G`. */
  spoken: z.string(),
});

const shortcutKeys = z.nullable(shortcutKey);

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
      /**
       * Which of the eight is stored, else the one its place gives; `null`
       * while what is stored is one this build does not know.
       */
      colorName: z.nullable(z.enum(PROFILE_COLOR_NAMES)),
      /** `false` while turned off, with no pages, mail or place in the titlebar. */
      enabled: z.boolean(),
      asleep: z.boolean(),
      checkMail: z.boolean(),
      /** Whether its mail is listed in the Unified inbox: its own value, else the app's. */
      unifiedInbox: z.boolean(),
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
  /**
   * The stored profiles this run does not use, after `profiles` in their
   * order, which the free version keeps for a license to bring back.
   */
  lockedProfiles: z.array(
    z.object({ id: profileId, name: z.string(), color: z.string() })
  ),
  /**
   * What this run lacks, by main's `can()`: a row of one of these shows the
   * Meru Pro badge with its control disabled. Empty during a trial and with
   * a license.
   */
  proRequired: z.array(z.enum(CAPABILITIES)),
  /** What the General page shows that is not a setting. */
  general: z.object({
    /**
     * Whether the system opens Meru at login, `null` on Linux, which has no
     * login item here; `real` is true in a release's build alone, every
     * other build only pretending.
     */
    openAtLogin: z.nullable(z.object({ on: z.boolean(), real: z.boolean() })),
    /**
     * Where downloads are saved, as the page shows it, and whether a chosen
     * folder is there to take them, which while it is not sends them to
     * the system's Downloads folder.
     */
    downloadsFolder: downloadsFolderShown,
    /**
     * The same of each listed profile that holds a folder of its own, by
     * its id.
     */
    profileDownloadsFolders: z.record(profileId, downloadsFolderShown),
    /**
     * What Language offers: what System shows Meru in and every language this
     * build has, each named in itself.
     */
    language: z.object({
      system: z.string(),
      choices: z.array(z.object({ language: z.string(), name: z.string() })),
    }),
    /**
     * What Spelling offers: the languages always checked, which are the
     * system's or, with no dictionary for it, those Chromium chose, and none
     * when it chose none; whether the system's is among them; and every
     * other language there is a dictionary for. `null` on macOS, which
     * checks with its own.
     */
    spelling: z.nullable(
      z.object({
        always: z.array(z.string()),
        system: z.boolean(),
        available: z.array(z.string()),
      })
    ),
    /**
     * Whether the system sends email links to Meru, as last asked of it;
     * `real` is true in a release's build alone, every other build only
     * pretending.
     */
    emailLinks: z.object({ isDefault: z.boolean(), real: z.boolean() }),
  }),
  /**
   * The sites whose links open without asking, each as stored, an origin
   * such as `https://example.com`, in the order trusted.
   */
  trustedSites: z.array(z.string()),
  /** What the Advanced page shows that is not a setting. */
  advanced: z.object({
    /**
     * Whether this run started with hardware acceleration, which a change
     * of the setting leaves as it is until the next launch.
     */
    hardwareAccelerationAtLaunch: z.boolean(),
  }),
  /**
   * The About page's values, as main read them once: the app's version as
   * Electron gives it, and the system's name and version with the processor
   * architecture, such as `macOS 27.2 (arm64)`.
   */
  about: z.object({ version: z.string(), operatingSystem: z.string() }),
  /**
   * Where updating stands, held by main for the run: `version` the one
   * downloading, ready or refused, else `null`; `lastChecked` when a check
   * last finished, `null` before one has.
   */
  updates: z.object({
    status: z.enum(UPDATE_STATUSES),
    version: z.nullable(z.string()),
    lastChecked: z.nullable(z.number()),
  }),
  /**
   * The Shortcuts page: a card per menu of the application menu, in the menu
   * bar's order, and the keys bound outside the registry, all of this
   * platform and in the app's language. A key is its parts as shown, one
   * per key, and how a screen reader says it.
   */
  shortcuts: z.object({
    cards: z.array(
      z.object({
        title: z.string(),
        rows: z.array(
          z.object({
            title: z.string(),
            /** None where the command has no key on this platform. */
            keys: shortcutKeys,
            /** A family's last command's key, its first's being `keys`; else none. */
            to: shortcutKeys,
          })
        ),
      })
    ),
    builtIn: z.array(z.object({ title: z.string(), keys: shortcutKey })),
  }),
  /** The language Meru shows, as a catalog's tag. */
  language: z.string(),
  ...ENTITLEMENT_STATE,
  /**
   * Whether an activation, a rename of this device or a retry the window
   * asked for is still out, so none is sent beside it, even by a window
   * opened after it was asked.
   */
  licenseRequest: z.boolean(),
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
