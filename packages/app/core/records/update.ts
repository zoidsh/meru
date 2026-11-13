import { z } from "zod";

export const updateStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("idle") }),
  z.object({ kind: z.literal("checking") }),
  z.object({ kind: z.literal("available"), version: z.string() }),
  z.object({
    kind: z.literal("downloading"),
    percent: z.number().min(0).max(100),
  }),
  z.object({ kind: z.literal("ready"), version: z.string() }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);

export type UpdateState = z.infer<typeof updateStateSchema>;
