import { isEqual } from "es-toolkit";

import type { Entitlement, EntitlementSource } from "../records/entitlement.ts";
import { fallsBackToFree } from "./schedule.ts";
import type { ScheduleState } from "./schedule.ts";
import type { Claims } from "./token.ts";

/** The entitlement a verified token's claims grant at `now`, in milliseconds; no claims is a device that has never had a token. */
export const deriveEntitlement = (
  claims: Claims | undefined,
  now: number,
  source: EntitlementSource
): Entitlement => {
  if (claims === undefined) {
    return { expiresAt: null, kind: "unknown", source };
  }
  const facts = { expiresAt: claims.exp * 1000, source };
  if (claims.status === "disabled") {
    return { ...facts, kind: "disabled", reason: claims.reason ?? "disabled" };
  }
  if (claims.plan === "trial") {
    const endsAt = (claims.endsAt ?? 0) * 1000;
    return endsAt > now
      ? { ...facts, endsAt, kind: "trial" }
      : { ...facts, kind: "free" };
  }
  return {
    ...facts,
    deviceLimit: claims.deviceLimit,
    kind: "licensed",
    plan: claims.plan,
    seat: claims.seat ?? null,
  };
};

/** What the device holds at `now`: free whatever its token says once its license key was refused with no trial running, and otherwise what the claims grant, from `source` when there are claims and from what was stored when there are none. */
export const entitlementOf = (
  state: ScheduleState | undefined,
  claims: Claims | undefined,
  now: number,
  source: EntitlementSource
): Entitlement =>
  state !== undefined && fallsBackToFree(state, claims, now)
    ? { expiresAt: null, kind: "free", source }
    : deriveEntitlement(claims, now, claims === undefined ? "stored" : source);

const grant = ({
  expiresAt: _expiresAt,
  source: _source,
  ...rest
}: Entitlement) => rest;

/** Whether two values grant the same, whatever token or answer each came from. */
export const sameGrant = (a: Entitlement, b: Entitlement): boolean =>
  isEqual(grant(a), grant(b));
