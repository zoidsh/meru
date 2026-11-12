import { z } from "zod";

import { idSchema } from "../core/records/id.ts";
import { orientationSchema } from "../core/records/layout.ts";
import { rectSchema } from "../core/records/rect.ts";
import { styleSchema } from "../core/records/style.ts";

export const stageSnapshotSchema = z.object({
  dividers: z.array(
    z.object({
      orientation: orientationSchema,
      rect: rectSchema,
      splitId: idSchema,
    })
  ),
  focusedPaneId: idSchema.nullable(),
  panes: z.array(z.object({ paneId: idSchema, rect: rectSchema })),
  style: styleSchema,
});

export type StageSnapshot = z.infer<typeof stageSnapshotSchema>;
