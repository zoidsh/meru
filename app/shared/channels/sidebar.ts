import { z } from "zod";

import { sidebarSchema } from "../../core/engines/sidebar.ts";
import { defineChannels, definePushes, push, sync } from "./define.ts";

/** The strip of the selected profile, which main lays the panes out beside. */
export const sidebar = defineChannels("sidebar", {
  snapshot: sync(z.object({}), sidebarSchema),
});

export const sidebarPushes = definePushes("sidebar", {
  changed: push(sidebarSchema),
});
