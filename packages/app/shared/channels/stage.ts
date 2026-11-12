import { z } from "zod";

import { idSchema } from "../../core/records/id.ts";
import { orientationSchema } from "../../core/records/layout.ts";
import { rectSchema } from "../../core/records/rect.ts";
import { stageSnapshotSchema } from "../stage.ts";
import {
  defineChannels,
  definePushes,
  event,
  invoke,
  push,
  sync,
} from "./define.ts";

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

export const e2e = defineChannels("e2e", {
  snapshot: invoke(
    z.object({}),
    z.object({
      stage: stageSnapshotSchema,
      views: z.array(rectSchema),
      /** Each pane's zoom factor, in layout order. */
      zoom: z.array(z.number()),
    })
  ),
});
