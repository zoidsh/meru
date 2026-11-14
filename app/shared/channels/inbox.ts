import { z } from "zod";

import { feedSchema } from "../../core/records/feed.ts";
import { defineChannels, definePushes, push, sync } from "./define.ts";

/** Each followed profile's feed as its last read listed it, by profile id. */
export const inboxSnapshotSchema = z.object({
  profiles: z.record(z.string(), feedSchema),
});

export type InboxSnapshot = z.infer<typeof inboxSnapshotSchema>;

export const inbox = defineChannels("inbox", {
  snapshot: sync(z.object({}), inboxSnapshotSchema),
});

export const inboxPushes = definePushes("inbox", {
  changed: push(inboxSnapshotSchema),
});
