import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  DAY,
  entitledProfiles,
  entitlementAt,
  isDowngradePending,
  maskLicenseKey,
  nextChangeAt,
  normalizeLicenseKey,
  sessionTier,
  tierCan,
} from "./entitlement.ts";
import type { Entitlement } from "./entitlement.ts";

const ISSUED = Date.UTC(2026, 10, 1);

const token = (fields: Partial<Entitlement>): Entitlement => ({
  v: 1,
  tier: "pro",
  deviceId: "device",
  issuedAt: ISSUED,
  expiresAt: ISSUED + 14 * DAY,
  ...fields,
});

const trial = token({ tier: "trial", trialEndsAt: ISSUED + 9.5 * DAY });

describe(tierCan, () => {
  it("grants every capability to a trial and a license, and none to free", () => {
    for (const capability of CAPABILITIES) {
      expect(tierCan("pro", capability)).toBeTruthy();
      expect(tierCan("trial", capability)).toBeTruthy();
      expect(tierCan("free", capability)).toBeFalsy();
    }
  });
});

describe(entitlementAt, () => {
  it("is free with no token and no key", () => {
    expect(entitlementAt({}, ISSUED)).toMatchObject({
      status: "none",
      tier: "free",
      lastConfirmed: null,
    });
  });

  it("is licensed while a Pro token holds, with who and where", () => {
    expect(
      entitlementAt(
        { token: token({ licensee: "Ada", deviceLabel: "Office Mac" }) },
        ISSUED + DAY
      )
    ).toStrictEqual({
      status: "licensed",
      tier: "pro",
      unconfirmedReason: null,
      trialDaysLeft: null,
      licensee: "Ada",
      deviceLabel: "Office Mac",
      lastConfirmed: ISSUED,
      trialChoicePending: false,
    });
  });

  it("counts a trial's calendar days to its last, 0 on it", () => {
    expect(entitlementAt({ token: trial }, ISSUED, "UTC")).toMatchObject({
      status: "trial",
      tier: "trial",
      trialDaysLeft: 9,
    });
    expect(
      entitlementAt({ token: trial }, ISSUED + 8.9 * DAY, "UTC")
    ).toMatchObject({ trialDaysLeft: 1 });
    expect(
      entitlementAt({ token: trial }, ISSUED + 9 * DAY, "UTC")
    ).toMatchObject({ trialDaysLeft: 0 });
  });

  it("ends a trial at its end, offline too", () => {
    expect(entitlementAt({ token: trial }, ISSUED + 9.5 * DAY)).toMatchObject({
      status: "trialEnded",
      tier: "free",
      trialDaysLeft: null,
    });
  });

  it("asks for a choice once a trial ends, until the person chooses the free version", () => {
    const ended = token({ tier: "free", reason: "trialEnded" });

    expect(entitlementAt({ token: ended }, ISSUED)).toMatchObject({
      trialChoicePending: true,
    });
    expect(entitlementAt({ token: trial }, ISSUED + 9.5 * DAY)).toMatchObject({
      trialChoicePending: true,
    });
    expect(
      entitlementAt({ token: ended, continuedFreeAt: ISSUED }, ISSUED)
    ).toMatchObject({ status: "trialEnded", trialChoicePending: false });
  });

  it("asks for no choice where no trial ended", () => {
    for (const record of [
      {},
      { token: trial },
      { token: token({}) },
      { token: token({ tier: "free", reason: "licenseRefused" }) },
    ]) {
      expect(entitlementAt(record, ISSUED).trialChoicePending).toBeFalsy();
    }
  });

  it("reads the server's free answers as an ended trial or a refused license", () => {
    expect(
      entitlementAt(
        { token: token({ tier: "free", reason: "trialEnded" }) },
        ISSUED
      )
    ).toMatchObject({ status: "trialEnded", tier: "free" });
    expect(
      entitlementAt(
        { token: token({ tier: "free", reason: "licenseRefused" }) },
        ISSUED
      )
    ).toMatchObject({ status: "refused", tier: "free" });
  });

  it("is unconfirmed, for no contact, once a token expires", () => {
    expect(
      entitlementAt({ token: token({}) }, ISSUED + 14 * DAY)
    ).toMatchObject({
      status: "unconfirmed",
      tier: "free",
      unconfirmedReason: "offline",
    });
  });

  it("is unconfirmed, for the clock, more than a day before the token's issue", () => {
    expect(entitlementAt({ token: token({}) }, ISSUED - DAY)).toMatchObject({
      status: "licensed",
    });
    expect(entitlementAt({ token: token({}) }, ISSUED - DAY - 1)).toMatchObject(
      { status: "unconfirmed", tier: "free", unconfirmedReason: "clock" }
    );
  });

  it("holds an imported key as Pro for 14 days from when it was stored, then unconfirmed", () => {
    const imported = { licenseKey: "MERU-AAAA", keyStoredAt: ISSUED };

    expect(entitlementAt(imported, ISSUED + 13 * DAY)).toMatchObject({
      status: "provisional",
      tier: "pro",
    });
    expect(entitlementAt(imported, ISSUED + 14 * DAY)).toMatchObject({
      status: "unconfirmed",
      tier: "free",
      unconfirmedReason: "offline",
    });
    expect(entitlementAt(imported, ISSUED - 2 * DAY)).toMatchObject({
      status: "unconfirmed",
      unconfirmedReason: "clock",
    });
  });

  it("grants nothing for a key with no token that no importer dated", () => {
    expect(entitlementAt({ licenseKey: "MERU-AAAA" }, ISSUED)).toMatchObject({
      status: "unconfirmed",
      tier: "free",
    });
  });
});

describe(nextChangeAt, () => {
  it("is the next local midnight of a trial, then its end", () => {
    expect(nextChangeAt({ token: trial }, ISSUED + 0.3 * DAY, "UTC")).toBe(
      ISSUED + DAY
    );
    expect(nextChangeAt({ token: trial }, ISSUED + 9 * DAY, "UTC")).toBe(
      ISSUED + 9.5 * DAY
    );
    expect(
      nextChangeAt({ token: trial }, ISSUED + 9.5 * DAY, "UTC")
    ).toBeUndefined();
  });

  it("is a license's expiry, or its issue's tolerance while the clock is behind", () => {
    expect(nextChangeAt({ token: token({}) }, ISSUED)).toBe(ISSUED + 14 * DAY);
    expect(nextChangeAt({ token: token({}) }, ISSUED - 3 * DAY)).toBe(
      ISSUED - DAY
    );
  });

  it("is nothing for free and none", () => {
    expect(nextChangeAt({}, ISSUED)).toBeUndefined();
    expect(
      nextChangeAt({ token: token({ tier: "free" }) }, ISSUED)
    ).toBeUndefined();
  });
});

describe(sessionTier, () => {
  it("raises what a run grants at once and never lowers it", () => {
    expect(sessionTier("free", "pro")).toBe("pro");
    expect(sessionTier("free", "trial")).toBe("trial");
    expect(sessionTier("trial", "pro")).toBe("pro");
    expect(sessionTier("pro", "free")).toBe("pro");
    expect(sessionTier("trial", "free")).toBe("trial");
  });

  it("reports the loss pending until the next launch", () => {
    expect(isDowngradePending("pro", "free")).toBeTruthy();
    expect(isDowngradePending("trial", "pro")).toBeFalsy();
    expect(isDowngradePending("free", "free")).toBeFalsy();
  });
});

describe(entitledProfiles, () => {
  it("keeps the first profile alone without Pro", () => {
    expect(entitledProfiles(["a", "b", "c"], false)).toStrictEqual(["a"]);
    expect(entitledProfiles(["a", "b", "c"], true)).toStrictEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe(maskLicenseKey, () => {
  it("shows a key's first and last blocks and bullets the rest", () => {
    expect(maskLicenseKey("MERU-ABCD-EFGH-1234-5678-90AB")).toBe(
      "MERU-••••-••••-••••-••••-90AB"
    );
  });

  it("never shows more than four characters at each end, whatever the blocks", () => {
    expect(maskLicenseKey("ABCDEFGH-12345678")).toBe("ABCD••••-••••5678");
    expect(maskLicenseKey("ABCDEFGH12345678")).toBe("ABCD••••••••5678");
    expect(maskLicenseKey("AB-CDEFGH-1")).toBe("AB-••••••-1");
  });

  it("shows nothing of a key of eight characters or fewer", () => {
    expect(maskLicenseKey("ABCD-123")).toBe("••••-•••");
    expect(maskLicenseKey("ABCDEFGH")).toBe("••••••••");
  });
});

describe(normalizeLicenseKey, () => {
  it("trims a key and refuses only the obvious slip", () => {
    expect(normalizeLicenseKey("  MERU-ABCD-EFGH-1234-5678-90AB \n")).toBe(
      "MERU-ABCD-EFGH-1234-5678-90AB"
    );
    expect(normalizeLicenseKey("")).toBeUndefined();
    expect(normalizeLicenseKey("MERU ABCD EFGH")).toBeUndefined();
    expect(normalizeLicenseKey("short")).toBeUndefined();
  });
});
