import { z } from "zod/mini";

import { decodeVersioned } from "./store-file.ts";
import type { Decoded } from "./store-file.ts";

export const SETTINGS_VERSION = 1;

/** Names of the file's own, which no setting may take. */
export const RESERVED_SETTING_NAMES = ["version", "profiles"] as const;

export interface SettingDefinition<Value = unknown> {
  schema: z.ZodMiniType<Value>;
  default: Value;
  /** `profile`: global, with an override a profile may hold. */
  scope: "global" | "profile";
  tier: "free" | "pro";
  /** Whether a change waits for the next launch. */
  restart: boolean;
}

const setting = <Value>(definition: SettingDefinition<Value>) => definition;

export const DESIGNS = ["modern", "classic"] as const;

export type Design = (typeof DESIGNS)[number];

/** Every setting, declared once. */
export const SETTINGS = {
  design: setting<Design>({
    schema: z.enum(DESIGNS),
    default: "modern",
    scope: "global",
    tier: "free",
    restart: false,
  }),
  /** Read on macOS alone. */
  vibrancy: setting<boolean>({
    schema: z.boolean(),
    default: true,
    scope: "global",
    tier: "free",
    restart: false,
  }),
};

export type SettingKey = keyof typeof SETTINGS;

export type SettingValue<Key extends SettingKey> =
  (typeof SETTINGS)[Key]["default"];

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

/** Whether a set of definitions leaves the file's own names alone. */
export const usesReservedName = (definitions: Record<string, unknown>) =>
  RESERVED_SETTING_NAMES.some((name) => Object.hasOwn(definitions, name));

if (usesReservedName(SETTINGS)) {
  throw new Error(
    `A setting may not be named ${RESERVED_SETTING_NAMES.join(" or ")}`
  );
}

/**
 * The file as it was found, with whatever the person set since. Values are
 * parsed when read, so one that does not parse, a key this build does not
 * know and an override of any shape stay where they are and are written back
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

type Definitions = Record<string, SettingDefinition>;

const override = (settings: Settings, profileId: string, key: string) => {
  const { profiles } = settings;

  if (typeof profiles !== "object" || profiles === null) {
    return;
  }

  const entry: unknown = Reflect.get(profiles, profileId);

  return typeof entry === "object" && entry !== null
    ? (Reflect.get(entry, key) as unknown)
    : undefined;
};

/**
 * Reads a key of `definitions`: a profile's override where the key may have
 * one and it parses, else the global value where it parses, else the default.
 */
export const readSettingOf = <
  Defined extends Definitions,
  Key extends keyof Defined & string,
>(
  definitions: Defined,
  settings: Settings,
  key: Key,
  profileId?: string
): Defined[Key]["default"] => {
  const definition = definitions[key] as Defined[Key];
  const parse = (value: unknown) => {
    const result = definition.schema.safeParse(value);

    return result.success ? { value: result.data } : undefined;
  };

  const own =
    definition.scope === "profile" && profileId !== undefined
      ? parse(override(settings, profileId, key))
      : undefined;

  return (own ?? parse(settings[key]))?.value ?? definition.default;
};

export const readSetting = <Key extends SettingKey>(
  settings: Settings,
  key: Key,
  profileId?: string
): SettingValue<Key> => readSettingOf(SETTINGS, settings, key, profileId);

/** Sets the global value; everything else in the file stays as it was. */
export const writeSetting = <Key extends SettingKey>(
  settings: Settings,
  key: Key,
  value: SettingValue<Key>
): Settings => ({ ...settings, [key]: value });
