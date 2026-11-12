import { z } from "zod";

/** A rectangle in integer device-independent pixels, relative to whatever contains it. */
export const rectSchema = z.object({
  height: z.number().int().nonnegative(),
  width: z.number().int().nonnegative(),
  x: z.number().int(),
  y: z.number().int(),
});

export type Rect = z.infer<typeof rectSchema>;
