import { z } from "zod";

import { idSchema } from "../../core/records/id.ts";
import { orientationSchema } from "../../core/records/layout.ts";
import { navigationSchema } from "../../core/records/navigation.ts";
import { pointSchema, rectSchema } from "../../core/records/rect.ts";
import { styleSchema } from "../../core/records/style.ts";
import {
  defineChannels,
  definePushes,
  event,
  invoke,
  noPayload,
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
    z.object({
      paneId: idSchema,
      /** Whether the pane shows a pinned tab, which nothing is dropped before. */
      pinned: z.boolean(),
      rect: rectSchema,
      tabId: idSchema,
    })
  ),
  style: styleSchema,
});

export type StageSnapshot = z.infer<typeof stageSnapshotSchema>;

/** What a drag over the panes carries: a split's divider, or a sidebar row dragged onto a pane. */
export const dragSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("divider"), splitId: idSchema }),
  z.object({ kind: z.literal("tab"), tabId: idSchema }),
]);

export type DragSubject = z.infer<typeof dragSubjectSchema>;

export const stage = defineChannels("stage", {
  /** Covers the panes of the sender's window with the drag's overlay, which takes the pointer until the release. */
  beginDrag: event(dragSubjectSchema),
  dragTo: event(pointSchema.extend({ buttons: z.number().int() })),
  endDrag: event(pointSchema),
  /** Ends the drag on, if any, with nothing dropped and no ratio taken. */
  cancelDrag: event(noPayload),
  /** Opens a tab of the app in the profile and shows it, in a group of one or, with `split`, beside the focused pane of the sender's window in that orientation; a single-instance app's one tab instead when the profile has it. */
  openTab: invoke(
    z.object({
      appId: idSchema,
      profileId: idSchema,
      split: orientationSchema.optional(),
    }),
    z.null()
  ),
  snapshot: sync(noPayload, stageSnapshotSchema),
});

export const stagePushes = definePushes("stage", {
  changed: push(stageSnapshotSchema),
  /** The drag the chrome page began was cancelled from the drag's own page, so the chrome page's drag ends too. */
  dragCancelled: push(noPayload),
});
