import { z } from "zod";

import { parseSettings } from "../../core/engines/settings-parse.ts";
import { gateRefusalSchema } from "../../core/entitlement/gate.ts";
import { idSchema } from "../../core/records/id.ts";
import { registry } from "./registry.ts";
import type {
  ProfileSettingKey,
  SettingKey,
  SettingValue,
} from "./registry.ts";

const keys: readonly SettingKey[] = registry.map((entry) => entry.key);

const settingKeySchema = z.enum(keys);

/** The layers whole, refusing any key the registry would drop; parseSettings is the lenient read. */
export const settingsSchema = z.unknown().transform((raw, context) => {
  const { settings, fallbacks } = parseSettings(registry, raw);
  for (const fallback of fallbacks) {
    context.issues.push({
      code: "custom",
      input: raw,
      message: `${fallback.key ?? "a layer"}${fallback.profileId === null ? "" : ` of ${fallback.profileId}`} is ${fallback.reason}`,
    });
  }
  return settings;
});

export const settingChangeSchema = z.object({
  key: settingKeySchema,
  profileId: z.string().min(1).nullable(),
  /** Absent when the layer no longer sets the key. */
  value: z.unknown().optional(),
});

export type SettingChangeMessage = z.infer<typeof settingChangeSchema>;

/** A write of one key: its value, or none to remove it, in the global layer or, for a key a profile may override, in a profile's. */
export type SettingSet = {
  readonly [K in SettingKey]: {
    readonly key: K;
    readonly value?: SettingValue<K>;
    readonly profileId?: K extends ProfileSettingKey ? string : never;
  };
}[SettingKey];

const setShape = z.object({
  key: settingKeySchema,
  profileId: idSchema.optional(),
  value: z.unknown().optional(),
});

const isSettingSet = (raw: unknown): raw is SettingSet => {
  const parsed = setShape.safeParse(raw);
  if (!parsed.success) {
    return false;
  }
  const { key, profileId, value } = parsed.data;
  const spec = registry.find((entry) => entry.key === key);
  return (
    spec !== undefined &&
    (profileId === undefined || spec.scope === "profile") &&
    (value === undefined || spec.schema.safeParse(value).success)
  );
};

export const settingSetSchema = z.custom<SettingSet>(isSettingSet, {
  message: "not a value of that setting, or not one a profile may override",
});

/** The write of a key named only at run time, such as by the settings page's fields; undefined when the value or the profile does not fit the key. */
export const settingSet = (
  key: SettingKey,
  value: unknown,
  profileId?: string
): SettingSet | undefined => {
  const payload =
    profileId === undefined ? { key, value } : { key, profileId, value };
  return isSettingSet(payload) ? payload : undefined;
};

/** The keys the entitlement holds at their default, each with the gate's reason. */
export const lockedSchema = z.partialRecord(
  settingKeySchema,
  gateRefusalSchema
);

export type Locked = z.infer<typeof lockedSchema>;
