import { z } from "zod/mini";

import {
  ENTITLEMENT_ERRORS,
  ENTITLEMENT_STATUSES,
  TIERS,
  UNCONFIRMED_REASONS,
} from "#core/entitlement.ts";

import type { EntitlementCallName } from "./entitlement-channels.ts";

export { ENTITLEMENT_CALL_NAMES } from "./entitlement-channels.ts";

/** How a call about the license ended; `message` is worded for the person. */
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
  /**
   * Names this device on its license; an empty name gives it back the
   * server's. With no license key stored it answers `noLicense`.
   */
  setDeviceName: {
    request: z.object({ name: z.string() }),
    response: result,
  },
  /** Asks the server again now, as the dialog shown for an unconfirmed license does. */
  retryEntitlement: {
    request: z.undefined(),
    response: z.undefined(),
  },
  /**
   * Puts the whole license key on the clipboard from main, so no page holds
   * it. With no license key stored it answers `noLicense`.
   */
  copyLicenseKey: {
    request: z.undefined(),
    response: result,
  },
  /**
   * Records that the person chose the free version after a trial, which
   * clears `trialChoicePending`; with no choice pending it records nothing.
   */
  continueFree: {
    request: z.undefined(),
    response: result,
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
    /**
     * Calendar days, in the device's calendar, to a running trial's last
     * day: 2 or more reads "ends in N days", 1 "ends tomorrow", 0 "ends today".
     */
    trialDaysLeft: z.nullable(z.number()),
    /** Who the license is for, as the server words it. */
    licensee: z.nullable(z.string()),
    /** This device's name on the license, shown with a license only. */
    deviceName: z.nullable(z.string()),
    /** When the server last confirmed this install, in ms since the epoch. */
    lastConfirmed: z.nullable(z.number()),
    /**
     * The stored key as Settings shows it: at most four characters of its
     * first and last blocks, and those only while at least as many stay
     * hidden, bullets for the rest (`MERU-••••-••••-••••-••••-7Q2K`
     * for a key shaped as v3's `MERU-XXXX-XXXX-XXXX-XXXX-XXXX`); `null` with
     * none. The whole key never reaches a page; `copyLicenseKey` copies it.
     */
    licenseKey: z.nullable(z.string()),
    /** The server took away what this run grants; it applies at the next launch. */
    downgradePending: z.boolean(),
    /**
     * The trial ended and the person has not chosen the free version since.
     * A later license or trial clears that choice, so a later lapse reads
     * pending again.
     */
    trialChoicePending: z.boolean(),
  }),
} as const;

export type EntitlementState = z.output<
  (typeof ENTITLEMENT_STATE)["entitlement"]
>;
