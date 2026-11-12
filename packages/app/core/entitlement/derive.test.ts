import { describe, expect, it } from "vitest";

import { deriveEntitlement, sameGrant } from "./derive.ts";
import type { Claims } from "./token.ts";

const NOW = 1_800_000_000_000;
const EXP = NOW / 1000 + 3600;

const claims = (overrides: Partial<Claims> = {}): Claims => ({
  deviceLimit: 3,
  exp: EXP,
  iat: NOW / 1000,
  plan: "pro",
  status: "active",
  sub: "device-1",
  ttl: 3600,
  ...overrides,
});

describe(deriveEntitlement, () => {
  it("is unknown with no claims", () => {
    expect(deriveEntitlement(undefined, NOW, "stored")).toStrictEqual({
      expiresAt: null,
      kind: "unknown",
      source: "stored",
    });
  });

  it.each(["pro", "team"] as const)("licenses the %s plan", (plan) => {
    expect(
      deriveEntitlement(claims({ plan, seat: "seat-2" }), NOW, "refreshed")
    ).toStrictEqual({
      deviceLimit: 3,
      expiresAt: EXP * 1000,
      kind: "licensed",
      plan,
      seat: "seat-2",
      source: "refreshed",
    });
  });

  it("gives a licensed plan with no seat a null seat", () => {
    expect(deriveEntitlement(claims(), NOW, "stored")).toMatchObject({
      seat: null,
    });
  });

  it("is a trial until it ends", () => {
    const endsAt = NOW / 1000 + 86_400;
    expect(
      deriveEntitlement(claims({ endsAt, plan: "trial" }), NOW, "stored")
    ).toStrictEqual({
      endsAt: endsAt * 1000,
      expiresAt: EXP * 1000,
      kind: "trial",
      source: "stored",
    });
  });

  it("is free once the trial has ended", () => {
    expect(
      deriveEntitlement(
        claims({ endsAt: NOW / 1000, plan: "trial" }),
        NOW,
        "stored"
      )
    ).toStrictEqual({ expiresAt: EXP * 1000, kind: "free", source: "stored" });
  });

  it("is disabled with the server's reason, whatever the plan", () => {
    expect(
      deriveEntitlement(
        claims({ reason: "refunded", status: "disabled" }),
        NOW,
        "refreshed"
      )
    ).toStrictEqual({
      expiresAt: EXP * 1000,
      kind: "disabled",
      reason: "refunded",
      source: "refreshed",
    });
  });
});

describe(sameGrant, () => {
  it("ignores where a value came from and when its token expires", () => {
    expect(
      sameGrant(
        deriveEntitlement(claims(), NOW, "stored"),
        deriveEntitlement(claims({ exp: EXP + 3600 }), NOW, "refreshed")
      )
    ).toBeTruthy();
  });

  it("tells a different reason apart", () => {
    expect(
      sameGrant(
        deriveEntitlement(
          claims({ reason: "refunded", status: "disabled" }),
          NOW,
          "stored"
        ),
        deriveEntitlement(
          claims({ reason: "revoked", status: "disabled" }),
          NOW,
          "stored"
        )
      )
    ).toBeFalsy();
  });
});
