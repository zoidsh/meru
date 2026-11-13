import { z } from "zod";

import { idSchema } from "../../core/records/id.ts";
import { colorSchema, profileSchema } from "../../core/records/profile.ts";
import { tabSchema } from "../../core/records/tab.ts";
import { profilesSnapshotSchema } from "../profiles.ts";
import { defineChannels, definePushes, invoke, push, sync } from "./define.ts";

export const profiles = defineChannels("profiles", {
  create: invoke(
    z.object({ color: colorSchema.optional(), label: z.string().min(1) }),
    profileSchema
  ),
  remove: invoke(z.object({ profileId: idSchema }), z.null()),
  select: invoke(z.object({ profileId: idSchema }), z.null()),
  snapshot: sync(z.object({}), profilesSnapshotSchema),
});

export const tabs = defineChannels("tabs", {
  add: invoke(z.object({ appId: idSchema, profileId: idSchema }), tabSchema),
  close: invoke(z.object({ tabId: idSchema }), z.null()),
  /** Moves the row holding the tab to row `to` of its profile's list. */
  move: invoke(z.object({ tabId: idSchema, to: z.number().int() }), z.null()),
});

export const profilesPushes = definePushes("profiles", {
  changed: push(profilesSnapshotSchema),
});
