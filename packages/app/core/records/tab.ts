import { z } from "zod";

import { idSchema } from "./id.ts";

export const tabSchema = z.object({
  appId: idSchema,
  /** A crash is per tab, so its health lives here rather than on the profile. */
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
