import { describe, expect, it } from "vitest";

import {
  ENTITLEMENT_VERSION,
  decodeEntitlementFile,
  storedContinuedFreeAt,
  storedKeyAt,
  storedLicenseKey,
  storedToken,
  withToken,
  withContinuedFree,
  withUnconfirmedKey,
} from "./entitlement-file.ts";

describe(decodeEntitlementFile, () => {
  it("reads its version, keeping what lies below as found", () => {
    expect(
      decodeEntitlementFile({ version: 1, token: 3, extra: "kept" })
    ).toStrictEqual({
      kind: "read",
      value: { version: 1, token: 3, extra: "kept" },
    });
  });

  it("stops at a newer version and refuses one no Meru wrote", () => {
    expect(decodeEntitlementFile({ version: 2 })).toStrictEqual({
      kind: "newer",
      version: 2,
    });
    expect(decodeEntitlementFile({ version: 0 }).kind).toBe("unreadable");
    expect(decodeEntitlementFile("garbage").kind).toBe("unreadable");
  });
});

describe("the entitlement file's fields", () => {
  it("are read only where they have their shape", () => {
    const file = { version: 1, token: 3, licenseKey: "", keyStoredAt: "x" };

    expect(storedToken(file)).toBeUndefined();
    expect(storedLicenseKey(file)).toBeUndefined();
    expect(storedKeyAt(file)).toBeUndefined();
  });

  it("take a token, dropping when a key was held without one", () => {
    const imported = withUnconfirmedKey({ version: 1, other: 1 }, "KEY", 5);

    expect(imported).toStrictEqual({
      version: 1,
      other: 1,
      licenseKey: "KEY",
      keyStoredAt: 5,
    });
    expect(withToken(imported, "TOKEN", { tier: "pro" })).toStrictEqual({
      version: 1,
      other: 1,
      licenseKey: "KEY",
      token: "TOKEN",
    });
    expect(
      withToken(imported, "TOKEN", { tier: "pro", licenseKey: "NEW" })
        .licenseKey
    ).toBe("NEW");
  });

  it("keep the choice of the free version through free tokens, and drop it for a trial or a license", () => {
    const chosen = withContinuedFree({ version: 1, token: "OLD" }, 7);

    expect(storedContinuedFreeAt(chosen)).toBe(7);
    expect(
      storedContinuedFreeAt(withToken(chosen, "FREE", { tier: "free" }))
    ).toBe(7);
    expect(
      storedContinuedFreeAt(withToken(chosen, "TRIAL", { tier: "trial" }))
    ).toBeUndefined();
    expect(
      storedContinuedFreeAt(
        withToken(chosen, "PRO", { tier: "pro", licenseKey: "KEY" })
      )
    ).toBeUndefined();
  });
});

describe("the entitlement file's version", () => {
  it("stays 1", () => {
    expect(
      ENTITLEMENT_VERSION,
      "a store's version never changes: its shape only grows, read leniently (see the comment at the constant)"
    ).toBe(1);
  });
});
