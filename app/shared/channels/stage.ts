import { z } from "zod";

import { idSchema } from "../../core/records/id.ts";
import { orientationSchema } from "../../core/records/layout.ts";
import { stageSnapshotSchema } from "../stage.ts";
import { defineChannels, definePushes, event, push, sync } from "./define.ts";

const pointer = z.object({ x: z.number(), y: z.number() });

export const stage = defineChannels("stage", {
  beginDrag: event(z.object({ splitId: idSchema })),
  close: event(z.object({ paneId: idSchema.optional() })),
  dragTo: event(pointer.extend({ buttons: z.number().int() })),
  endDrag: event(pointer),
  focusPane: event(z.object({ paneId: idSchema })),
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
