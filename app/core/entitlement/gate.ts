import type { Entitlement } from "../records/entitlement.ts";

export type GatedFeature =
  | "extraProfile"
  | "extension"
  | "unifiedInbox"
  | "proSetting";

export interface GateContext {
  /** Milliseconds since the epoch. */
  readonly now: number;
  /** Profiles that exist before the one being opened. */
  readonly profiles: number;
}

export type GateRefusal = "free" | "trialEnded" | "disabled";

export type Gate =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: GateRefusal;
      /** For extraProfile, how many profiles the refused entitlement allows. */
      readonly allowedProfiles?: number;
    };

/** Profiles a free entitlement may have. */
export const FREE_PROFILES = 1;

const ALLOWED: Gate = { allowed: true };

const freeAllows = (feature: GatedFeature, context: GateContext) =>
  feature === "extraProfile" && context.profiles < FREE_PROFILES;

/** Whether the entitlement allows a Pro action now; read at the moment of use, never cached. */
export const canUse = (
  entitlement: Entitlement,
  feature: GatedFeature,
  context: GateContext
): Gate => {
  if (entitlement.kind === "licensed") {
    return ALLOWED;
  }
  if (entitlement.kind === "trial" && entitlement.endsAt > context.now) {
    return ALLOWED;
  }
  if (freeAllows(feature, context)) {
    return ALLOWED;
  }
  let reason: GateRefusal = "free";
  if (entitlement.kind === "trial") {
    reason = "trialEnded";
  } else if (entitlement.kind === "disabled") {
    reason = "disabled";
  }
  return feature === "extraProfile"
    ? { allowed: false, allowedProfiles: FREE_PROFILES, reason }
    : { allowed: false, reason };
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
