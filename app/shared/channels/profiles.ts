import { z } from "zod";

import { gateRefusalSchema } from "../../core/entitlement/gate.ts";
import { idSchema } from "../../core/records/id.ts";
import { besideSchema } from "../../core/records/layout.ts";
import { colorSchema, profileSchema } from "../../core/records/profile.ts";
import { profilesStateSchema } from "../../core/records/profiles-state.ts";
import { tabSchema } from "../../core/records/tab.ts";
import { defineChannels, definePushes, invoke, push, sync } from "./define.ts";

/** What a page is told about profiles: the state, with each profile marked deactivated when the entitlement does not allow it, each tab whether it may close, and why the entitlement refuses another profile, null while it allows one. */
export const profilesSnapshotSchema = profilesStateSchema.extend({
  newProfileRefusal: gateRefusalSchema.nullable(),
  profiles: z.array(profileSchema.extend({ deactivated: z.boolean() })),
  tabs: z.array(
    tabSchema.extend({ asleep: z.boolean(), closeable: z.boolean() })
  ),
});

export type ProfilesSnapshot = z.infer<typeof profilesSnapshotSchema>;

export const profiles = defineChannels("profiles", {
  create: invoke(
    z.object({ color: colorSchema.optional(), label: z.string().min(1) }),
    profileSchema
  ),
  remove: invoke(z.object({ profileId: idSchema }), z.null()),
  select: invoke(z.object({ profileId: idSchema }), z.null()),
  /** Renames the profile or changes its colour. */
  update: invoke(
    z.object({
      color: colorSchema.optional(),
      label: z.string().min(1).optional(),
      profileId: idSchema,
    }),
    z.null()
  ),
  snapshot: sync(z.object({}), profilesSnapshotSchema),
});

export const tabs = defineChannels("tabs", {
  close: invoke(z.object({ tabId: idSchema }), z.null()),
  /** Shows the tab's group in the main window and focuses its pane, selecting its profile first. */
  focus: invoke(z.object({ tabId: idSchema }), z.null()),
  /** Puts the tab beside or below another tab's pane, on the side named, in that tab's group, taking it out of its own group first. */
  join: invoke(
    besideSchema.extend({ tabId: idSchema, targetTabId: idSchema }),
    z.null()
  ),
  /** Takes the tab out of its group into a group of its own, at row `to` of its profile's list. */
  leave: invoke(z.object({ tabId: idSchema, to: z.number().int() }), z.null()),
  /** Moves the row holding the tab to row `to` of its profile's list. */
  move: invoke(z.object({ tabId: idSchema, to: z.number().int() }), z.null()),
});

export const profilesPushes = definePushes("profiles", {
  changed: push(profilesSnapshotSchema),
});
