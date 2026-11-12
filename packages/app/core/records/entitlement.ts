import { z } from "zod";

/** Milliseconds since the epoch, as the clock reads time. */
const instantSchema = z.number().int();

const facts = {
  /** When the token the value came from expires, or null when there is none. */
  expiresAt: instantSchema.nullable(),
  source: z.enum(["stored", "refreshed"]),
};

export const entitlementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown"), ...facts }),
  z.object({ kind: z.literal("free"), ...facts }),
  z.object({ endsAt: instantSchema, kind: z.literal("trial"), ...facts }),
  z.object({
    deviceLimit: z.number().int().nonnegative(),
    kind: z.literal("licensed"),
    plan: z.enum(["pro", "team"]),
    seat: z.string().nullable(),
    ...facts,
  }),
  z.object({ kind: z.literal("disabled"), reason: z.string(), ...facts }),
]);

export type Entitlement = z.infer<typeof entitlementSchema>;

export type EntitlementKind = Entitlement["kind"];

export type EntitlementSource = Entitlement["source"];
