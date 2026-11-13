import { z } from "zod";

import { idSchema } from "./id.ts";

/** Where a link to the app opens when nothing else asks: as a tab, or in a window of its own. */
export const openBehaviorSchema = z.enum(["tab", "window"]);

export type OpenBehavior = z.infer<typeof openBehaviorSchema>;

export const appSchema = z.object({
  /** A link to one of these hosts, or a subdomain of one, is a link to the app; `host/segment` claims only paths starting with that segment, for apps that share a host. */
  hosts: z.array(z.string().min(1)).min(1),
  /** The name of the app's bundled icon. */
  icon: z.string().min(1),
  id: idSchema,
  name: z.string().min(1),
  openBehavior: openBehaviorSchema,
  /** A profile keeps one tab of the app, which every link to it reuses and which cannot be closed. */
  singleInstance: z.boolean().optional(),
  url: z.url(),
});

export type App = z.infer<typeof appSchema>;
