import { z } from "zod";

import { idSchema } from "./id.ts";

export const profileStatusSchema = z.object({
  kind: z.enum(["ok", "needsSignIn"]),
  reason: z.string().optional(),
  /** Unread mail in the profile's Gmail, as its page last reported it. */
  unreadCount: z.number().int().nonnegative().optional(),
});

export type ProfileStatus = z.infer<typeof profileStatusSchema>;

export const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu);

export const profileSchema = z.object({
  color: colorSchema.optional(),
  // Kept from 3.x on import, since the session partition is named after it.
  id: idSchema,
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
  status: profileStatusSchema,
});

export type Profile = z.infer<typeof profileSchema>;

/** The colours a new profile is given one of. */
export const PROFILE_COLORS = [
  "#e5484d",
  "#f76b15",
  "#ffc53d",
  "#30a46c",
  "#12a594",
  "#0090ff",
  "#3e63dd",
  "#8e4ec6",
  "#d6409f",
  "#8d8d86",
] as const;

/** The session partition a profile's panes load in. */
export const partitionOf = (profileId: string) => `persist:${profileId}`;

/** A colour from the palette, picked by the profile's id, which is random. */
export const colorFor = (profileId: string): string => {
  let sum = 0;
  for (const char of profileId) {
    sum += char.codePointAt(0) ?? 0;
  }
  return PROFILE_COLORS[sum % PROFILE_COLORS.length] ?? PROFILE_COLORS[0];
};
