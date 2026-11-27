import { z } from "zod/mini";

import { quietWindowSchema } from "./notification-gate.ts";
import type { QuietWindow } from "./notification-gate.ts";
import type { Platform } from "./platform.ts";
import { SOUND_CHOICES, soundVolumeSchema } from "./sounds.ts";
import type { SoundChoice } from "./sounds.ts";
import { decodeVersioned } from "./store-file.ts";
import type { Decoded } from "./store-file.ts";
import { UPDATE_CHANNELS } from "./updates.ts";
import type { UpdateChannel } from "./updates.ts";

/**
 * Never changes. An older integer here reads as unreadable, so a bump would
 * set every person's settings aside. The shape only grows, a new field
 * optional and read leniently, so every build reads every file written
 * before it.
 */
export const SETTINGS_VERSION = 1;

/** Names of the file's own, which no setting may take. */
const RESERVED_SETTING_NAMES = ["version", "profiles"] as const;

export interface SettingDefinition<Value = unknown> {
  schema: z.ZodMiniType<Value>;
  /** The same everywhere, or chosen by the platform Meru runs on. */
  default: Value | ((platform: Platform) => Value);
  /** A profile may hold a value of its own, which it reads in place of the app's. */
  overridable?: true;
  /**
   * The value a file written before this setting existed implies, read from
   * the keys it replaced while the file holds none of its own that parses;
   * `undefined` for the default.
   */
  earlier?: (settings: Settings) => Value | undefined;
}

/** What `SETTINGS` may declare: any name but the file's own. */
export type SettingDeclarations = Record<string, SettingDefinition> &
  Partial<Record<(typeof RESERVED_SETTING_NAMES)[number], never>>;

const setting = <Value>(definition: SettingDefinition<Value>) => definition;

const overridable = <Value>(definition: SettingDefinition<Value>) => ({
  ...definition,
  overridable: true as const,
});

export const TRAY_ICON_COLORS = ["system", "light", "dark"] as const;

export type TrayIconColor = (typeof TRAY_ICON_COLORS)[number];

/** The default first. */
export const THEMES = ["system", "light", "dark"] as const;

export type ThemeChoice = (typeof THEMES)[number];

/** Which tabs sleep once idle, the default first. */
export const SLEEP_IDLE_TABS = ["unpinned", "chosen", "all"] as const;

export type SleepIdleTabs = (typeof SLEEP_IDLE_TABS)[number];

/** How long a tab stays idle before it sleeps, shortest first. */
export const SLEEP_AFTER = ["30m", "1h", "3h", "6h"] as const;

export type SleepAfter = (typeof SLEEP_AFTER)[number];

/** The default first. */
export const VERIFICATION_CODE_COPY_MODES = [
  "notificationClick",
  "immediately",
] as const;

export type VerificationCodeCopyMode =
  (typeof VERIFICATION_CODE_COPY_MODES)[number];

/** What is done with the email once its code is copied, the default first. */
export const VERIFICATION_CODE_AFTER_COPY = [
  "nothing",
  "markRead",
  "trash",
] as const;

export type VerificationCodeAfterCopy =
  (typeof VERIFICATION_CODE_AFTER_COPY)[number];

/**
 * An absolute path on macOS, Linux or Windows (a drive or a network share),
 * read without `node:path`, which core does without.
 */
const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/u;

/** Every setting, declared once. */
export const SETTINGS = {
  /** A notification for mail that arrives. */
  notifications: overridable<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  notificationSender: overridable<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  notificationSubject: overridable<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  notificationSummary: overridable<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** Notifies only the new mail Gmail's Important feed also lists. */
  notificationImportantOnly: overridable<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /**
   * When new-mail notifications are held. A list where one window does not
   * parse is read as none, so nothing is held by a value Meru cannot read.
   */
  quietHours: overridable<QuietWindow[]>({
    schema: z.array(quietWindowSchema),
    default: [],
  }),
  /**
   * What a new-mail or verification-code notification sounds like: one of
   * Meru's own sounds, the system's, or none.
   */
  notificationSound: overridable<SoundChoice>({
    schema: z.enum(SOUND_CHOICES),
    default: "linen",
  }),
  /** The volume of Meru's own sounds, from 0.05 to 1. */
  notificationSoundVolume: setting<number>({
    schema: soundVolumeSchema,
    default: 1,
  }),
  /**
   * A new message with a one-time code gets a notification with the code in
   * place of its own, whatever switches new mail's off, and the code is
   * copied.
   */
  verificationCodes: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /**
   * Whether a code's notification shows while Do Not Disturb or quiet hours
   * hold new mail's; off, they hold it as well.
   */
  verificationCodesDuringDoNotDisturb: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** When the code is copied: from its notification, or as it shows. */
  verificationCodeCopyMode: setting<VerificationCodeCopyMode>({
    schema: z.enum(VERIFICATION_CODE_COPY_MODES),
    default: "notificationClick",
  }),
  /**
   * What is done with the message once its code is copied, never on
   * detection. A file from before it holds two switches instead, Trash
   * winning where both are on; they are read, never written.
   */
  verificationCodeAfterCopy: setting<VerificationCodeAfterCopy>({
    schema: z.enum(VERIFICATION_CODE_AFTER_COPY),
    default: "nothing",
    earlier: (settings) => {
      if (settings.verificationCodeTrash === true) {
        return "trash";
      }

      return settings.verificationCodeMarkRead === true
        ? "markRead"
        : undefined;
    },
  }),
  /**
   * Meru starts without showing its main window, at every launch as v3's
   * Launch minimized did; `launchWindow` says how it stays in reach.
   */
  openInBackground: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /**
   * The folder downloads are saved to, as the folder picker gave it; `null`
   * for the system's Downloads folder. Only Change… writes it; a relative
   * path, which only a hand edit makes, reads as none chosen.
   */
  downloadsFolder: overridable<string | null>({
    schema: z.nullable(z.string().check(z.regex(ABSOLUTE_PATH))),
    default: null,
  }),
  /** Each download opens the system's save dialog, at the folder above. */
  downloadsSaveAs: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /**
   * Each finished download is shown in its folder: in Finder, File Explorer
   * or the file manager.
   */
  downloadsShowInFolder: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /** Light or dark for every window of Meru, or as the system is. */
  theme: setting<ThemeChoice>({
    schema: z.enum(THEMES),
    default: "system",
  }),
  /**
   * Whether the titlebar and the sidebar take a touch of the selected
   * profile's colour, a tab's own window its profile's.
   */
  profileTint: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /**
   * Whether the titlebar shows New tab, which it does only while the sidebar
   * is hidden. Hidden, its command, menu item and shortcut still work.
   */
  titlebarNewTab: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /**
   * Whether the titlebar shows Unified inbox, which it does only with two or
   * more profiles.
   */
  titlebarUnifiedInbox: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** Whether the titlebar shows Downloads and the progress it draws. */
  titlebarDownloads: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /**
   * Whether the titlebar shows Do Not Disturb's moon while it is off; while
   * it holds the moon shows whatever this says, so nothing silences
   * notifications unseen. It never changes Do Not Disturb itself.
   */
  titlebarDoNotDisturb: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /**
   * The tray or menu bar icon. Off on macOS, where the Dock already shows the
   * count and reaches the window, as in v3.
   */
  tray: setting<boolean>({
    schema: z.boolean(),
    default: (platform) => platform !== "darwin",
  }),
  /**
   * Read on Windows and Linux; "system" follows the taskbar's light or dark
   * mode, not `theme` (`Theme.systemIsDark`).
   */
  trayIconColor: setting<TrayIconColor>({
    schema: z.enum(TRAY_ICON_COLORS),
    default: "system",
  }),
  /** The count beside the menu bar icon; read on macOS alone. */
  trayUnreadCount: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** Whether clicking the tray icon first selects a profile with unread mail. */
  trayJumpsToUnread: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /**
   * The Dock icon, read on macOS alone. It hides only while the menu bar icon
   * shows (`dockShown`), so Meru is never out of reach.
   */
  dockIcon: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** The Dock badge, the taskbar overlay or the launcher's count. */
  unreadBadge: overridable<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** The profile's mail is listed in the Unified inbox. */
  unifiedInbox: overridable<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** The storage, policy and account activity footer below Gmail's list. */
  hideInboxFooter: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /** Google's promotional banners above Gmail's list. */
  hidePromoBanner: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /** Gmail's own Upgrade button. */
  hideUpgradeButton: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /** An open conversation newest message first, on screen only. */
  reverseConversation: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /** Each message's attachments above its text rather than below. */
  moveAttachmentsToTop: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /** The quoted text Gmail folds behind its ••• button, shown. */
  showTrimmedContent: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /**
   * A compose window of its own, one Meru opened for an email link or
   * Gmail's pop-out, hides once Gmail says its email was sent, and closes
   * once Gmail's Undo has gone unless the main window's Undo was pressed.
   */
  closeComposeWindowAfterSend: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /**
   * Gmail's own Dark theme carried to the surfaces it leaves white, while
   * Gmail itself is Dark, whatever Meru's theme.
   */
  extendDarkTheme: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /** Google's ad hosts, in every profile's pages. */
  blockAds: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** Google's trackers and telemetry, and email open-tracking pixels. */
  blockTrackers: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** Asks before a link opens in the default browser, unless its site is trusted. */
  confirmLinks: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /**
   * The sites whose links open without asking, each an origin such as
   * `https://example.com`, as v3's trusted hosts are. Read entry by entry,
   * so one that is not a string costs only itself.
   */
  trustedSites: setting<string[]>({
    schema: z.pipe(
      z.array(z.unknown()),
      z.transform((entries) =>
        entries.filter((entry): entry is string => typeof entry === "string")
      )
    ),
    default: [],
  }),
  /**
   * Whether a link, or New tab, opens a Google app other than Gmail in Meru
   * rather than the default browser. Tabs already open stay.
   */
  openAppsInMeru: overridable<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /**
   * The apps, by id, that a link or New tab opens in the default browser
   * while `openAppsInMeru` is on. Read entry by entry, so one that is not a
   * string costs only itself; an id this build does not know is kept.
   */
  appsInDefaultBrowser: overridable<string[]>({
    schema: z.pipe(
      z.array(z.unknown()),
      z.transform((entries) =>
        entries.filter((entry): entry is string => typeof entry === "string")
      )
    ),
    default: [],
  }),
  /** Which tabs sleep once idle for `sleepAfter`: v3's Hibernate idle tabs. */
  sleepIdleTabs: setting<SleepIdleTabs>({
    schema: z.enum(SLEEP_IDLE_TABS),
    default: "unpinned",
  }),
  /** How long a tab is hidden before it sleeps: v3's Hibernate after. */
  sleepAfter: setting<SleepAfter>({
    schema: z.enum(SLEEP_AFTER),
    default: "1h",
  }),
  /**
   * Meru's own language, as a catalog's tag, or `system` for the one the
   * system prefers. A tag this build has no catalog for reads as `system`.
   */
  language: setting<string>({
    schema: z.string(),
    default: "system",
  }),
  /**
   * The languages checked as you type besides the system's, on Windows and
   * Linux; macOS checks its own. One with no dictionary is kept, unchecked.
   */
  spellcheckLanguages: setting<string[]>({
    schema: z.array(z.string()),
    default: [],
  }),
  /**
   * Read once before the app is ready, by `hardwareAccelerationAtLaunch`, so
   * a change applies at the next launch.
   */
  hardwareAcceleration: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /**
   * On macOS, whether a page asking to share a screen gets the system's own
   * picker in place of Meru's; macOS before 15 has none, and shows Meru's.
   */
  systemScreenPicker: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** Checks for a new version at launch and every three hours. */
  autoUpdate: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** Which releases Meru updates to: stable ones, or betas too. */
  updateChannel: setting<UpdateChannel>({
    schema: z.enum(UPDATE_CHANNELS),
    default: "stable",
  }),
} satisfies SettingDeclarations;

export type SettingKey = keyof typeof SETTINGS;

export type SettingValue<Key extends SettingKey> = Exclude<
  (typeof SETTINGS)[Key]["default"],
  (platform: Platform) => unknown
>;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

/** The settings a profile may hold a value of its own for. */
export type OverridableSettingKey = {
  [Key in SettingKey]: (typeof SETTINGS)[Key] extends { overridable: true }
    ? Key
    : never;
}[SettingKey];

export const OVERRIDABLE_SETTING_KEYS = SETTING_KEYS.filter(
  (key): key is OverridableSettingKey =>
    (SETTINGS[key] as SettingDefinition).overridable === true
);

/**
 * The file as it was found, with whatever the person set since. Values are
 * parsed when read, so one that does not parse, a key this build does not
 * know and a profile's override stay where they are and are written back
 * as found until the person sets that key.
 */
export type Settings = Readonly<Record<string, unknown>> & {
  readonly version: number;
};

const settingsSchema = z.looseObject({
  version: z.literal(SETTINGS_VERSION),
});

export const createInitialSettings = (): Settings => ({
  version: SETTINGS_VERSION,
});

/** Only garbage, a version no Meru wrote or a newer one fails to read. */
export const decodeSettings = (value: unknown): Decoded<Settings> =>
  decodeVersioned(value, SETTINGS_VERSION, settingsSchema);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The file's `profiles`, where it is an object. */
const profileEntries = (settings: Settings) =>
  isRecord(settings.profiles) ? settings.profiles : undefined;

/** The profile's overrides, where its entry is an object. */
const profileEntry = (settings: Settings, profileId: string) => {
  const entries = profileEntries(settings);
  const entry =
    entries && Object.hasOwn(entries, profileId)
      ? entries[profileId]
      : undefined;

  return isRecord(entry) ? entry : undefined;
};

const parseValue = (key: SettingKey, value: unknown) =>
  (SETTINGS[key] as SettingDefinition).schema.safeParse(value);

/** The profile's own value of the key, where it holds one that parses. */
const parsedOverride = (
  settings: Settings,
  profileId: string,
  key: SettingKey
) => {
  const entry = profileEntry(settings, profileId);
  const parsed =
    entry && Object.hasOwn(entry, key)
      ? parseValue(key, entry[key])
      : undefined;

  return parsed?.success ? parsed : undefined;
};

/**
 * The value the file holds where it parses, else the platform's default.
 * With a profile, an overridable key reads that profile's value where it
 * holds one that parses, else the app's.
 */
export const readSetting = <Key extends SettingKey>(
  settings: Settings,
  key: Key,
  platform: Platform,
  profileId?: string
): SettingValue<Key> => {
  const definition: SettingDefinition = SETTINGS[key];

  if (profileId !== undefined && definition.overridable) {
    const override = parsedOverride(settings, profileId, key);

    if (override) {
      return override.data as SettingValue<Key>;
    }
  }

  const parsed = definition.schema.safeParse(settings[key]);

  if (parsed.success) {
    return parsed.data as SettingValue<Key>;
  }

  const earlier = definition.earlier?.(settings);

  if (earlier !== undefined) {
    return earlier as SettingValue<Key>;
  }

  return (
    typeof definition.default === "function"
      ? definition.default(platform)
      : definition.default
  ) as SettingValue<Key>;
};

/** Sets the global value; everything else in the file stays as it was. */
export const writeSetting = <Key extends SettingKey>(
  settings: Settings,
  key: Key,
  value: SettingValue<Key>
): Settings => ({ ...settings, [key]: value });

/** `profiles` as `entries` leaves it, absent once it holds none. */
const withEntries = (
  settings: Settings,
  entries: Readonly<Record<string, unknown>>
): Settings => {
  if (Object.keys(entries).length > 0) {
    return { ...settings, profiles: entries };
  }

  const { profiles: _dropped, ...rest } = settings;

  return rest as Settings;
};

/**
 * Sets the profile's own value, even one equal to the app's; everything else
 * in the file stays as it was. A `profiles` or an entry that is not an object
 * gives way to one.
 */
export const writeOverride = <Key extends OverridableSettingKey>(
  settings: Settings,
  profileId: string,
  key: Key,
  value: SettingValue<Key>
): Settings => ({
  ...settings,
  profiles: {
    ...profileEntries(settings),
    [profileId]: { ...profileEntry(settings, profileId), [key]: value },
  },
});

/** Deletes the profile's own value; an entry or `profiles` left empty goes. */
export const clearOverride = (
  settings: Settings,
  profileId: string,
  key: OverridableSettingKey
): Settings => {
  const entries = profileEntries(settings);
  const entry = profileEntry(settings, profileId);

  if (!entries || !entry || !Object.hasOwn(entry, key)) {
    return settings;
  }

  const { [key]: _cleared, ...rest } = entry;
  const { [profileId]: _entry, ...others } = entries;

  return withEntries(
    settings,
    Object.keys(rest).length > 0 ? { ...others, [profileId]: rest } : others
  );
};

/** Deletes the profile's entry; a `profiles` left empty goes. */
export const clearProfileOverrides = (
  settings: Settings,
  profileId: string
): Settings => {
  const entries = profileEntries(settings);

  if (!entries || !Object.hasOwn(entries, profileId)) {
    return settings;
  }

  const { [profileId]: _entry, ...others } = entries;

  return withEntries(settings, others);
};

/** The ids whose entry holds a value of the key that parses. */
export const overridingProfiles = (
  settings: Settings,
  key: OverridableSettingKey
) =>
  Object.keys(profileEntries(settings) ?? {}).filter(
    (profileId) => parsedOverride(settings, profileId, key) !== undefined
  );

/** The ids `profiles` has an entry for, whatever it holds. */
export const profilesWithEntries = (settings: Settings) =>
  Object.keys(profileEntries(settings) ?? {});
