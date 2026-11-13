import { z } from "zod";

import {
  lockedSchema,
  settingChangeSchema,
  settingSetSchema,
  settingsSchema,
} from "../settings/schema.ts";
import { defineChannels, definePushes, invoke, push, sync } from "./define.ts";

export const settings = defineChannels("settings", {
  /** Sets a key in the global layer, or in a profile's when one is named; an absent value removes it. A locked key is refused. */
  set: invoke(settingSetSchema, z.null()),
  snapshot: sync(
    z.object({}),
    z.object({ layers: settingsSchema, locked: lockedSchema })
  ),
});

export const settingsPushes = definePushes("settings", {
  changed: push(
    z.object({ changes: z.array(settingChangeSchema), locked: lockedSchema })
  ),
});
