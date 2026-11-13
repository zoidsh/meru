import { z } from "zod";

import { defineChannels, event } from "./define.ts";

export const shortcuts = defineChannels("shortcuts", {
  /** The shortcuts page records the next key pressed, which the menu must not take while it does. */
  recording: event(z.object({ recording: z.boolean() })),
});
