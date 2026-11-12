import { z } from "zod";

export const styleSchema = z.enum(["modern", "classic"]);

export type Style = z.infer<typeof styleSchema>;
