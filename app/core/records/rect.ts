import { z } from "zod";

export const rectSchema = z.object({
  height: z.number().int().nonnegative(),
  width: z.number().int().nonnegative(),
  x: z.number().int(),
  y: z.number().int(),
});

export type Rect = z.infer<typeof rectSchema>;

export const pointSchema = z.object({ x: z.number(), y: z.number() });

export type Point = z.infer<typeof pointSchema>;
