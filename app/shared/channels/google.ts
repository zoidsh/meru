import { z } from "zod";

import { definePushes, push } from "./define.ts";

export const meetToggleSchema = z.enum(["microphone", "camera"]);

export type MeetToggle = z.infer<typeof meetToggleSchema>;

/** What main tells the page of a Google app's pane other than Gmail. */
export const googlePushes = definePushes("google", {
  /** Turns Meet's microphone or camera on or off, as its own button does. */
  meetToggle: push(z.object({ toggle: meetToggleSchema })),
});
