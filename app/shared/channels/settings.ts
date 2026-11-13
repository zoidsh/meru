import { z } from "zod";

import { idSchema } from "../../core/records/id.ts";
import {
  settingChangeSchema,
  settingKeySchema,
  settingsSchema,
} from "../settings/schema.ts";
import { defineChannels, definePushes, invoke, push, sync } from "./define.ts";

export const settings = defineChannels("settings", {
  /** Sets a key in the global layer, or in a profile's when one is named; an absent value removes it. */
  set: invoke(
    z.object({
      key: settingKeySchema,
      profileId: idSchema.optional(),
      value: z.unknown(),
    }),
    z.null()
  ),
  snapshot: sync(z.object({}), settingsSchema),
});

export const settingsPushes = definePushes("settings", {
  changed: push(z.object({ changes: z.array(settingChangeSchema) })),
});
