import { z } from "zod";

import { rectSchema } from "../../core/records/rect.ts";
import { commandIdSchema } from "../commands/registry.ts";
import { defineChannels, invoke } from "./define.ts";

/** Answered only under MERU_E2E=1, for the end-to-end suite, which reads everything else through the channels the chrome page uses. */
export const e2e = defineChannels("e2e", {
  snapshot: invoke(
    z.object({}),
    z.object({
      /** The accelerator of each command in the application menu. */
      menu: z.partialRecord(commandIdSchema, z.string().nullable()),
      /** Bounds Electron reports for each child view, bottom first. */
      views: z.array(rectSchema),
      /** Each pane's zoom factor, in layout order. */
      zoom: z.array(z.number()),
    })
  ),
});
