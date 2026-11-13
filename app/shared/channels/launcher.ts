import { z } from "zod";

import { defineChannels, event } from "./define.ts";

export const launcher = defineChannels("launcher", {
  /** Opens the launcher over the panes of the sender's window. */
  open: event(z.object({})),
  /** Takes the launcher down, from the launcher's own page. */
  close: event(z.object({})),
});
