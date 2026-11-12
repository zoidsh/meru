import type { Entitlement, EntitlementSource } from "../records/entitlement.ts";
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

const grant = ({
  expiresAt: _expiresAt,
  source: _source,
  ...rest
}: Entitlement) => JSON.stringify(rest);

/** Whether two values grant the same, whatever token or answer each came from. */
export const sameGrant = (a: Entitlement, b: Entitlement): boolean =>
  grant(a) === grant(b);
