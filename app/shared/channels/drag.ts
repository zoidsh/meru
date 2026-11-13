import { z } from "zod";

import { defineChannels, event } from "./define.ts";

const pointer = z.object({ x: z.number(), y: z.number() });

export const drag = defineChannels("drag", {
  end: event(pointer),
  move: event(pointer.extend({ buttons: z.number().int() })),
});
