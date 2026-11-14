import { z } from "zod";

import { updateStateSchema } from "../../core/records/update.ts";
import {
  defineChannels,
  definePushes,
  invoke,
  noPayload,
  push,
  sync,
} from "./define.ts";

/** Why the updater refused to check or to install. */
export const updaterErrorSchema = z.enum(["notPackaged", "notReady"]);

export type UpdaterError = z.infer<typeof updaterErrorSchema>;

export const updater = defineChannels("updater", {
  /** Checks now, as the command does, answering why it refused or null when the check went ahead. */
  check: invoke(noPayload, updaterErrorSchema.nullable()),
  snapshot: sync(noPayload, updateStateSchema),
});

export const updaterPushes = definePushes("updater", {
  changed: push(updateStateSchema),
});
