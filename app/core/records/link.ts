import { z } from "zod";

/** What the click asked for, as Chromium reports it: an ordinary click, a background tab, or a new window. */
export const dispositionSchema = z.enum(["default", "background", "window"]);

export type Disposition = z.infer<typeof dispositionSchema>;
