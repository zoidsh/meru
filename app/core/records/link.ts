import { z } from "zod";

/** How a page opened a link: in place, navigating the page itself, or through a new window or tab, as Chromium's disposition reports it, a foreground tab being `default`. */
export const dispositionSchema = z.enum([
  "inPlace",
  "default",
  "background",
  "window",
]);

export type Disposition = z.infer<typeof dispositionSchema>;
