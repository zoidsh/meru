import { z } from "zod";

import { idSchema } from "./id.ts";

export const tabSchema = z.object({
  appId: idSchema,
  health: z.enum(["ok", "crashed"]),
  id: idSchema,
  pinned: z.boolean(),
  profileId: idSchema,
  sleeping: z.boolean(),
  title: z.string(),
  url: z.url(),
  zoom: z.number().positive(),
});

export type Tab = z.infer<typeof tabSchema>;
