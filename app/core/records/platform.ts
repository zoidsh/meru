import { z } from "zod";

/** An operating system Meru runs on, as Node names it. */
export const platformSchema = z.enum(["darwin", "linux", "win32"]);

export type Platform = z.infer<typeof platformSchema>;

/** The platform as Node names it, another Unix taken as Linux, whose desktops behave alike. */
export const platformOf = (name: string): Platform =>
  platformSchema.catch("linux").parse(name);
