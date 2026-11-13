import { z } from "zod";

import { entitlementSchema } from "../../core/records/entitlement.ts";
import { rectSchema } from "../../core/records/rect.ts";
import { updateStateSchema } from "../../core/records/update.ts";
import { profilesSnapshotSchema } from "../profiles.ts";
import { stageSnapshotSchema } from "../stage.ts";
import { defineChannels, invoke } from "./define.ts";

/** Answered only under MERU_E2E=1, for the end-to-end suite. */
export const e2e = defineChannels("e2e", {
  snapshot: invoke(
    z.object({}),
    z.object({
      entitlement: entitlementSchema,
      /** The accelerator of each item in the application menu, by id. */
      menu: z.record(z.string(), z.string().nullable()),
      profiles: profilesSnapshotSchema,
      stage: stageSnapshotSchema,
      update: updateStateSchema,
      /** Bounds Electron reports for each child view, bottom first. */
      views: z.array(rectSchema),
      /** Each pane's zoom factor, in layout order. */
      zoom: z.array(z.number()),
    })
  ),
});
