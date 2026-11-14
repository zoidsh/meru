import { z } from "zod";

import { idSchema } from "./id.ts";

export const tabSchema = z.object({
  appId: idSchema,
  health: z.enum(["ok", "crashed"]),
  id: idSchema,
  profileId: idSchema,
  /** Whether the user lets the tab sleep once it has been out of sight for `sleep.afterMinutes`; whether it is asleep is the app's to know, never stored. */
  sleeps: z.boolean(),
  /** The page's own title, null until it reports one. */
  title: z.string().nullable(),
  url: z.url(),
  zoom: z.number().positive(),
});

export type Tab = z.infer<typeof tabSchema>;
