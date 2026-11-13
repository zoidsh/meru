import { z } from "zod";

import { idSchema } from "./id.ts";

export const tabSchema = z.object({
  appId: idSchema,
  health: z.enum(["ok", "crashed"]),
  id: idSchema,
  pinned: z.boolean(),
  profileId: idSchema,
  sleeping: z.boolean(),
  /** The page's own title, null until it reports one. */
  title: z.string().nullable(),
  url: z.url(),
  zoom: z.number().positive(),
});

export type Tab = z.infer<typeof tabSchema>;
