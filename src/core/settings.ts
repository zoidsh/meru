import { z } from "zod/mini";

import { decodeVersioned } from "./store-file.ts";
import type { Decoded } from "./store-file.ts";

export const SETTINGS_VERSION = 1;

/** Names of the file's own, which no setting may take. */
export const RESERVED_SETTING_NAMES = ["version", "profiles"] as const;

export interface SettingDefinition<Value = unknown> {
  schema: z.ZodMiniType<Value>;
  default: Value;
}

/** What `SETTINGS` may declare: any name but the file's own. */
export type SettingDeclarations = Record<string, SettingDefinition> &
  Partial<Record<(typeof RESERVED_SETTING_NAMES)[number], never>>;

const setting = <Value>(definition: SettingDefinition<Value>) => definition;

export const DESIGNS = ["modern", "classic"] as const;

export type Design = (typeof DESIGNS)[number];

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
} satisfies SettingDeclarations;

export type SettingKey = keyof typeof SETTINGS;

export type SettingValue<Key extends SettingKey> =
  (typeof SETTINGS)[Key]["default"];

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

/** The value the file holds where it parses, else the default. */
export const readSetting = <Key extends SettingKey>(
  settings: Settings,
  key: Key
): SettingValue<Key> => {
  const definition: SettingDefinition = SETTINGS[key];
  const parsed = definition.schema.safeParse(settings[key]);

  return (
    parsed.success ? parsed.data : definition.default
  ) as SettingValue<Key>;
};

/** Sets the global value; everything else in the file stays as it was. */
export const writeSetting = <Key extends SettingKey>(
  settings: Settings,
  key: Key,
  value: SettingValue<Key>
): Settings => ({ ...settings, [key]: value });
