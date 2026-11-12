import { z } from "zod";

/** The appearance style: `modern` insets and rounds the panes, `classic` draws them edge to edge with thin seams. */
export const styleSchema = z.enum(["modern", "classic"]);

export type Style = z.infer<typeof styleSchema>;
