import { z } from "zod/mini";

import {
  ENTITLEMENT_ERRORS,
  ENTITLEMENT_STATUSES,
  TIERS,
  UNCONFIRMED_REASONS,
} from "#core/entitlement.ts";

import type { EntitlementCallName } from "./entitlement-channels.ts";

export { ENTITLEMENT_CALL_NAMES } from "./entitlement-channels.ts";

/** How an activation or a rename ended; `message` is worded for the person. */
const result = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    error: z.enum(ENTITLEMENT_ERRORS),
    message: z.string(),
  }),
]);

/**
 * The calls of Meru Pro's page and of the trial footer's dialogs, for the
 * Settings and shell contracts to spread into their own.
 */
export const ENTITLEMENT_CALLS = {
  /** Activates a key on this device; a failure keeps the key before it, so it also changes one. */
  activateLicense: {
    request: z.object({ licenseKey: z.string() }),
    response: result,
  },
  /** Renames this device on its license. */
  setDeviceName: {
    request: z.object({ name: z.string() }),
    response: result,
  },
  /** Asks the server again now, as the dialog shown for an unconfirmed license does. */
  retryEntitlement: {
    request: z.undefined(),
    response: z.undefined(),
  },
} as const satisfies Record<
  EntitlementCallName,
  { request: z.ZodMiniType; response: z.ZodMiniType }
>;

/** The slice those surfaces read, for the same contracts to add under this name. */
export const ENTITLEMENT_STATE = {
  entitlement: z.object({
    status: z.enum(ENTITLEMENT_STATUSES),
    /** What this run grants; a downgrade changes it only at the next launch. */
    tier: z.enum(TIERS),
    /** Why the license or trial could not be confirmed, while `status` is `unconfirmed`. */
    unconfirmedReason: z.nullable(z.enum(UNCONFIRMED_REASONS)),
    /** Whole days left in a running trial: 0 on its last day. */
    trialDaysLeft: z.nullable(z.number()),
    /** Who the license is for, as the server words it. */
    licensee: z.nullable(z.string()),
    /** This device's name on the license. */
    deviceName: z.nullable(z.string()),
    /** When the server last confirmed this install, in ms since the epoch. */
    lastConfirmed: z.nullable(z.number()),
    hasLicenseKey: z.boolean(),
    /** The server took away what this run grants; it applies at the next launch. */
    downgradePending: z.boolean(),
  }),
} as const;

export type EntitlementState = z.output<
  (typeof ENTITLEMENT_STATE)["entitlement"]
>;
