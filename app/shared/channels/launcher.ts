import { z } from "zod";

import { orientationSchema } from "../../core/records/layout.ts";
import { defineChannels, event } from "./define.ts";

export const launcher = defineChannels("launcher", {
  /** Opens the launcher over the panes of the sender's window; with `split`, the app picked goes into a new pane of that orientation beside the focused one. */
  open: event(z.object({ split: orientationSchema.optional() })),
  /** Takes the launcher down, from the launcher's own page. */
  close: event(z.object({})),
});
