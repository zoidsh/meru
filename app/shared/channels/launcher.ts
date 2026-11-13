import { z } from "zod";

import { rectSchema } from "../../core/records/rect.ts";
import { defineChannels, definePushes, event, push } from "./define.ts";

export const launcher = defineChannels("launcher", {
  /** Opens the launcher over the panes of the sender's window, beside `anchor`, the button it was opened from. */
  open: event(z.object({ anchor: rectSchema })),
  /** Takes the launcher down, from the launcher's own page. */
  close: event(z.object({})),
});

export const launcherPushes = definePushes("launcher", {
  /** tabs.new ran: the chrome page opens the launcher from whichever of its buttons is showing. */
  requested: push(z.object({})),
});
