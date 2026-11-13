import { z } from "zod";

import { updateStateSchema } from "../../core/records/update.ts";
import { defineChannels, definePushes, push, sync } from "./define.ts";

export const updater = defineChannels("updater", {
  snapshot: sync(z.object({}), updateStateSchema),
});

export const updaterPushes = definePushes("updater", {
  changed: push(updateStateSchema),
});
