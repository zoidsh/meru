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
  | { readonly allowed: false; readonly reason: GateRefusal };

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
  if (entitlement.kind === "trial") {
    return { allowed: false, reason: "trialEnded" };
  }
  if (entitlement.kind === "disabled") {
    return { allowed: false, reason: "disabled" };
  }
  return { allowed: false, reason: "free" };
};
