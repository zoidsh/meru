import { z } from "zod";

import { defineChannels, definePushes, event, push } from "./define.ts";

const pointer = z.object({ x: z.number(), y: z.number() });

export const drag = defineChannels("drag", {
  end: event(pointer),
  move: event(pointer.extend({ buttons: z.number().int() })),
});

export const dragPushes = definePushes("drag", {
  /** Where the pointer is over the window, as the chrome page saw it, for a drag overlay that does not get the pointer itself while the chrome page holds it. */
  pointer: push(pointer),
});
