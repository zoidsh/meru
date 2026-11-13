import { z } from "zod";

import { idSchema } from "./id.ts";
import { rectSchema } from "./rect.ts";

export const windowSchema = z.object({
  bounds: rectSchema,
  groupId: idSchema,
  id: idSchema,
  kind: z.enum(["main", "group"]),
});

export type Window = z.infer<typeof windowSchema>;
