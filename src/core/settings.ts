import { z } from "zod/mini";

import { quietWindowSchema } from "./notification-gate.ts";
import type { QuietWindow } from "./notification-gate.ts";
import type { Platform } from "./platform.ts";
import { SOUND_CHOICES, soundVolumeSchema } from "./sounds.ts";
import type { SoundChoice } from "./sounds.ts";
import { decodeVersioned } from "./store-file.ts";
import type { Decoded } from "./store-file.ts";

export const SETTINGS_VERSION = 1;

/** Names of the file's own, which no setting may take. */
export const RESERVED_SETTING_NAMES = ["version", "profiles"] as const;

export interface SettingDefinition<Value = unknown> {
  schema: z.ZodMiniType<Value>;
  /** The same everywhere, or chosen by the platform Meru runs on. */
  default: Value | ((platform: Platform) => Value);
}

/** What `SETTINGS` may declare: any name but the file's own. */
export type SettingDeclarations = Record<string, SettingDefinition> &
  Partial<Record<(typeof RESERVED_SETTING_NAMES)[number], never>>;

const setting = <Value>(definition: SettingDefinition<Value>) => definition;

export const DESIGNS = ["modern", "classic"] as const;

export const TRAY_ICON_COLORS = ["system", "light", "dark"] as const;

export type TrayIconColor = (typeof TRAY_ICON_COLORS)[number];

export type Design = (typeof DESIGNS)[number];

/** The default first. */
export const VERIFICATION_CODE_COPY_MODES = [
  "notificationClick",
  "immediately",
] as const;

export type VerificationCodeCopyMode =
  (typeof VERIFICATION_CODE_COPY_MODES)[number];

/** Every setting, declared once. */
export const SETTINGS = {
  design: setting<Design>({
    schema: z.enum(DESIGNS),
    default: "modern",
  }),
  /** Read on macOS alone. */
  vibrancy: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** A notification for mail that arrives. */
  notifications: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  notificationSender: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  notificationSubject: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  notificationSummary: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** Notifies only the new mail Gmail's Important feed also lists. */
  notificationImportantOnly: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /**
   * When new-mail notifications are held. A list where one window does not
   * parse is read as none, so nothing is held by a value Meru cannot read.
   */
  quietHours: setting<QuietWindow[]>({
    schema: z.array(quietWindowSchema),
    default: [],
  }),
  /**
   * What a new-mail or verification-code notification sounds like: one of
   * Meru's own sounds, the system's, or none.
   */
  notificationSound: setting<SoundChoice>({
    schema: z.enum(SOUND_CHOICES),
    default: "linen",
  }),
  /** The volume of Meru's own sounds, from 0.05 to 1. */
  notificationSoundVolume: setting<number>({
    schema: soundVolumeSchema,
    default: 1,
  }),
  /**
   * A new message with a one-time code gets a notification with the code,
   * shown whatever holds new-mail ones, and the code is copied.
   */
  verificationCodes: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** When the code is copied: from its notification, or as it shows. */
  verificationCodeCopyMode: setting<VerificationCodeCopyMode>({
    schema: z.enum(VERIFICATION_CODE_COPY_MODES),
    default: "notificationClick",
  }),
  /** Marks the message read once its code is copied, never on detection. */
  verificationCodeMarkRead: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /**
   * Moves the message to Trash once its code is copied, in place of marking
   * it read when both are on.
   */
  verificationCodeTrash: setting<boolean>({
    schema: z.boolean(),
    default: false,
  }),
  /**
   * The tray or menu bar icon. Off on macOS, where the Dock already shows the
   * count and reaches the window, as in v3.
   */
  tray: setting<boolean>({
    schema: z.boolean(),
    default: (platform) => platform !== "darwin",
  }),
  /** Read on Windows and Linux; "system" follows the dark or light theme. */
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
  /** The Dock badge, the taskbar overlay or the launcher's count. */
  unreadBadge: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** The Gmail logo in the top left of Gmail's page. */
  hideGmailLogo: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** The storage, policy and account activity footer below Gmail's list. */
  hideInboxFooter: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** Google's promotional banners above Gmail's list. */
  hidePromoBanner: setting<boolean>({
    schema: z.boolean(),
    default: true,
  }),
  /** Gmail's own Upgrade button. */
  hideUpgradeButton: setting<boolean>({
    schema: z.boolean(),
    default: true,
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
} satisfies SettingDeclarations;

export type SettingKey = keyof typeof SETTINGS;

export type SettingValue<Key extends SettingKey> = Exclude<
  (typeof SETTINGS)[Key]["default"],
  (platform: Platform) => unknown
>;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

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

/** The value the file holds where it parses, else the platform's default. */
export const readSetting = <Key extends SettingKey>(
  settings: Settings,
  key: Key,
  platform: Platform
): SettingValue<Key> => {
  const definition: SettingDefinition = SETTINGS[key];
  const parsed = definition.schema.safeParse(settings[key]);

  if (parsed.success) {
    return parsed.data as SettingValue<Key>;
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
