import { z } from "zod";

import { pointSchema } from "../../core/records/rect.ts";
import { defineChannels, definePushes, event, push } from "./define.ts";

export const drag = defineChannels("drag", {
  end: event(pointSchema),
  move: event(pointSchema.extend({ buttons: z.number().int() })),
});

export const dragPushes = definePushes("drag", {
  /** Where the pointer is over the window, as the chrome page saw it, for a drag overlay that does not get the pointer itself while the chrome page holds it. */
  pointer: push(pointSchema),
});
