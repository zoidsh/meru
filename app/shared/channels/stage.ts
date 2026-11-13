import { z } from "zod";

import { idSchema } from "../../core/records/id.ts";
import { orientationSchema } from "../../core/records/layout.ts";
import { navigationSchema } from "../../core/records/navigation.ts";
import { rectSchema } from "../../core/records/rect.ts";
import { styleSchema } from "../../core/records/style.ts";
import {
  defineChannels,
  definePushes,
  event,
  invoke,
  push,
  sync,
} from "./define.ts";

export const stageSnapshotSchema = z.object({
  dividers: z.array(
    z.object({
      orientation: orientationSchema,
      rect: rectSchema,
      splitId: idSchema,
    })
  ),
  focusedPaneId: idSchema.nullable(),
  /** The focused pane's history, which the titlebar's back, forward and reload follow; null with no pane. */
  navigation: navigationSchema.nullable(),
  panes: z.array(
    z.object({ paneId: idSchema, rect: rectSchema, tabId: idSchema })
  ),
  style: styleSchema,
});

export type StageSnapshot = z.infer<typeof stageSnapshotSchema>;

const pointer = z.object({ x: z.number(), y: z.number() });

export const stage = defineChannels("stage", {
  beginDrag: event(z.object({ splitId: idSchema })),
  dragTo: event(pointer.extend({ buttons: z.number().int() })),
  endDrag: event(pointer),
  /** Opens a tab of the app in the profile and shows it, in a group of one or, with `split`, beside the focused pane of the sender's window in `orientation`, vertical unless named; a single-instance app's one tab instead when the profile has it. */
  openTab: invoke(
    z.object({
      appId: idSchema,
      orientation: orientationSchema.optional(),
      profileId: idSchema,
      split: z.boolean(),
    }),
    z.null()
  ),
  snapshot: sync(z.object({}), stageSnapshotSchema),
});

export const stagePushes = definePushes("stage", {
  changed: push(stageSnapshotSchema),
});
