import { describe, expect, it } from "vitest";

import type { Entitlement } from "../records/entitlement.ts";
import { canUse, deactivatedProfiles, FREE_PROFILES } from "./gate.ts";
import type { GatedFeature } from "./gate.ts";

const NOW = 1_800_000_000_000;
const facts = { expiresAt: NOW + 1000, source: "stored" } as const;

const unknown: Entitlement = { ...facts, expiresAt: null, kind: "unknown" };
const free: Entitlement = { ...facts, kind: "free" };
const trial: Entitlement = { ...facts, endsAt: NOW + 1, kind: "trial" };
const ended: Entitlement = { ...facts, endsAt: NOW, kind: "trial" };
const licensed: Entitlement = {
  ...facts,
  deviceLimit: 3,
  kind: "licensed",
  plan: "pro",
  seat: null,
};
const disabled: Entitlement = {
  ...facts,
  kind: "disabled",
  reason: "refunded",
};

const features: GatedFeature[] = [
  "extraProfile",
  "extension",
  "unifiedInbox",
  "proSetting",
];

const many = { now: NOW, profiles: FREE_PROFILES };

const at = (feature: GatedFeature, entitlement: Entitlement) =>
  feature === "extraProfile"
    ? canUse(entitlement, feature, many)
    : canUse(entitlement, feature, { now: NOW });

describe(canUse, () => {
  it.each(features)("lets a license and a running trial use %s", (feature) => {
    expect(at(feature, licensed)).toStrictEqual({ allowed: true });
    expect(at(feature, trial)).toStrictEqual({ allowed: true });
  });

  it.each([
    [unknown, "free"],
    [free, "free"],
    [ended, "trialEnded"],
    [disabled, "disabled"],
  ] as const)("refuses %o every Pro action, as %s", (entitlement, reason) => {
    for (const feature of features) {
      expect(at(feature, entitlement)).toMatchObject({
        allowed: false,
        reason,
      });
    }
  });

  it("says how many profiles free allows when it refuses another", () => {
    expect(canUse(free, "extraProfile", many)).toStrictEqual({
      allowed: false,
      allowedProfiles: 1,
      reason: "free",
    });
  });

  it.each([unknown, free, ended, disabled])(
    "lets %o open the profiles free allows",
    (entitlement) => {
      expect(
        canUse(entitlement, "extraProfile", {
          now: NOW,
          profiles: FREE_PROFILES - 1,
        })
      ).toStrictEqual({ allowed: true });
    }
  );

  it("refuses a trial at the moment it ends, whatever the token says", () => {
    expect(canUse(trial, "extension", { now: NOW + 1 })).toStrictEqual({
      allowed: false,
      reason: "trialEnded",
    });
  });
});

describe(deactivatedProfiles, () => {
  const ids = ["a", "b", "c"];

  it.each([unknown, free, ended, disabled])(
    "deactivates every profile past the free count under %o",
    (entitlement) => {
      expect(deactivatedProfiles(ids, entitlement, NOW)).toStrictEqual(
        new Set(ids.slice(FREE_PROFILES))
      );
    }
  );

  it.each([trial, licensed])("deactivates none under %o", (entitlement) => {
    expect(deactivatedProfiles(ids, entitlement, NOW).size).toBe(0);
  });
});
