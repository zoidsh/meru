import { updateStateSchema } from "../../core/records/update.ts";
import {
  defineChannels,
  definePushes,
  noPayload,
  push,
  sync,
} from "./define.ts";

export const updater = defineChannels("updater", {
  snapshot: sync(noPayload, updateStateSchema),
});

export const updaterPushes = definePushes("updater", {
  changed: push(updateStateSchema),
});
