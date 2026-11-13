import { z } from "zod";

import { parseSettings } from "../../core/engines/settings-parse.ts";
import { registry } from "./registry.ts";
import type { SettingKey } from "./registry.ts";

const keys: readonly SettingKey[] = registry.map((entry) => entry.key);

export const settingKeySchema = z.enum(keys);

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
