import { z } from "zod";

/** Where a page stands in its history, and whether it is loading. */
export const navigationSchema = z.object({
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  loading: z.boolean(),
});

export type Navigation = z.infer<typeof navigationSchema>;

/** A move through a page's history, or a reload or stop of it. */
export const navigationActionSchema = z.enum([
  "back",
  "forward",
  "reload",
  "stop",
]);

export type NavigationAction = z.infer<typeof navigationActionSchema>;
