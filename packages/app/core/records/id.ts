import { z } from "zod";

/** Ids are opaque: nothing parses one, and only the `Ids` port makes them. */
export const idSchema = z.string().min(1);
