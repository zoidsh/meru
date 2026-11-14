import { z } from "zod";

import type { Entitlement } from "../records/entitlement.ts";

export type GatedFeature =
  | "extraProfile"
  | "extension"
  | "unifiedInbox"
  | "proSetting";

export interface GateContext {
  /** Milliseconds since the epoch. */
  readonly now: number;
}

export interface ProfileGateContext extends GateContext {
  /** Profiles that exist before the one being opened. */
  readonly profiles: number;
}

/** What the gate needs to know of the moment: the time, and for another profile how many there are. */
export type GateContextOf<F extends GatedFeature> = F extends "extraProfile"
  ? ProfileGateContext
  : GateContext;

export const gateRefusalSchema = z.enum(["free", "trialEnded", "disabled"]);

export type GateRefusal = z.infer<typeof gateRefusalSchema>;

export type Gate =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: GateRefusal };

/** Profiles a free entitlement may have. */
export const FREE_PROFILES = 1;

const ALLOWED: Gate = { allowed: true };

const freeAllows = (context: GateContext | ProfileGateContext) =>
  "profiles" in context && context.profiles < FREE_PROFILES;

/** Whether the entitlement allows a Pro action now; read at the moment of use, never cached. */
export const canUse = <F extends GatedFeature>(
  entitlement: Entitlement,
  feature: F,
  context: GateContextOf<F>
): Gate => {
  if (entitlement.kind === "licensed") {
    return ALLOWED;
  }
  if (entitlement.kind === "trial" && entitlement.endsAt > context.now) {
    return ALLOWED;
  }
  if (freeAllows(context)) {
    return ALLOWED;
  }
  let reason: GateRefusal = "free";
  if (entitlement.kind === "trial") {
    reason = "trialEnded";
  } else if (entitlement.kind === "disabled") {
    reason = "disabled";
  }
  return { allowed: false, reason };
};

/** Which of the profiles, in sidebar order, the entitlement leaves deactivated: kept with everything in them, but not usable until it allows them again. */
export const deactivatedProfiles = (
  orderedIds: readonly string[],
  entitlement: Entitlement,
  now: number
): Set<string> =>
  new Set(
    orderedIds.filter(
      (_id, index) =>
        !canUse(entitlement, "extraProfile", { now, profiles: index }).allowed
    )
  );
