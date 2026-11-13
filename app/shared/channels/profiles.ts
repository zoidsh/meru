import { z } from "zod";

import { idSchema } from "../../core/records/id.ts";
import { colorSchema, profileSchema } from "../../core/records/profile.ts";
import { profilesStateSchema } from "../../core/records/profiles-state.ts";
import { tabSchema } from "../../core/records/tab.ts";
import { defineChannels, definePushes, invoke, push, sync } from "./define.ts";

/** What a page is told about profiles: the state, with each profile marked deactivated when the entitlement does not allow it, and each tab whether it may close. */
export const profilesSnapshotSchema = profilesStateSchema.extend({
  profiles: z.array(profileSchema.extend({ deactivated: z.boolean() })),
  tabs: z.array(tabSchema.extend({ closeable: z.boolean() })),
});

export type ProfilesSnapshot = z.infer<typeof profilesSnapshotSchema>;

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
  /** Shows the tab's group in the main window and focuses its pane, selecting its profile first. */
  focus: invoke(z.object({ tabId: idSchema }), z.null()),
  /** Puts the tab beside another tab's pane, in that tab's group, taking it out of its own group first. */
  join: invoke(z.object({ tabId: idSchema, targetTabId: idSchema }), z.null()),
  /** Takes the tab out of its group into a group of its own, at row `to` of its profile's list. */
  leave: invoke(z.object({ tabId: idSchema, to: z.number().int() }), z.null()),
  /** Moves the row holding the tab to row `to` of its profile's list. */
  move: invoke(z.object({ tabId: idSchema, to: z.number().int() }), z.null()),
});

export const profilesPushes = definePushes("profiles", {
  changed: push(profilesSnapshotSchema),
});
