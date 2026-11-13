import { z } from "zod";

import { idSchema } from "./id.ts";
import { layoutSchema } from "./layout.ts";

export const groupSchema = z.object({
  id: idSchema,
  layout: layoutSchema,
  profileId: idSchema,
  tabIds: z.array(idSchema),
});

export type Group = z.infer<typeof groupSchema>;
