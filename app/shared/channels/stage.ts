import { z } from "zod";

import { idSchema } from "../../core/records/id.ts";
import { orientationSchema } from "../../core/records/layout.ts";
import { rectSchema } from "../../core/records/rect.ts";
import { styleSchema } from "../../core/records/style.ts";
import { defineChannels, definePushes, event, push, sync } from "./define.ts";

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
  navigation: z
    .object({
      canGoBack: z.boolean(),
      canGoForward: z.boolean(),
      loading: z.boolean(),
    })
    .nullable(),
  panes: z.array(z.object({ paneId: idSchema, rect: rectSchema })),
  style: styleSchema,
});

export type StageSnapshot = z.infer<typeof stageSnapshotSchema>;

const pointer = z.object({ x: z.number(), y: z.number() });

export const stage = defineChannels("stage", {
  beginDrag: event(z.object({ splitId: idSchema })),
  close: event(z.object({ paneId: idSchema.optional() })),
  dragTo: event(pointer.extend({ buttons: z.number().int() })),
  endDrag: event(pointer),
  focusPane: event(z.object({ paneId: idSchema })),
  /** Moves the focused pane through its history, or reloads or stops it. */
  navigate: event(
    z.object({ action: z.enum(["back", "forward", "reload", "stop"]) })
  ),
  resize: event(
    z.object({ ratio: z.number().min(0).max(1), splitId: idSchema })
  ),
  snapshot: sync(z.object({}), stageSnapshotSchema),
  split: event(
    z.object({ orientation: orientationSchema, paneId: idSchema.optional() })
  ),
});

export const stagePushes = definePushes("stage", {
  changed: push(stageSnapshotSchema),
});
