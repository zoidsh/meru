import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { Entitlement } from "#core/entitlement.ts";

import { publicKeyFromRaw, verifyToken } from "./entitlement-token.ts";

const pair = generateKeyPairSync("ed25519");
const other = generateKeyPairSync("ed25519");

const PAYLOAD: Entitlement = {
  v: 1,
  tier: "pro",
  deviceId: "device",
  issuedAt: 1,
  expiresAt: 2,
};

const signed = (payload: unknown, privateKey = pair.privateKey) => {
  const bytes = Buffer.from(JSON.stringify(payload));

  return `${bytes.toString("base64url")}.${sign(null, bytes, privateKey).toString("base64url")}`;
};

describe(verifyToken, () => {
  it("reads a token signed with the key, for this device", () => {
    expect(
      verifyToken(signed(PAYLOAD), pair.publicKey, "device")
    ).toStrictEqual(PAYLOAD);
  });

  it("refuses another key's signature, another device's token and a changed payload", () => {
    expect(
      verifyToken(signed(PAYLOAD, other.privateKey), pair.publicKey, "device")
    ).toBeUndefined();
    expect(
      verifyToken(signed(PAYLOAD), pair.publicKey, "other")
    ).toBeUndefined();

    const [, signature] = signed(PAYLOAD).split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...PAYLOAD, expiresAt: 9e15 })
    ).toString("base64url");

    expect(
      verifyToken(`${forged}.${signature}`, pair.publicKey, "device")
    ).toBeUndefined();
  });

  it("refuses what is not a token", () => {
    for (const text of [
      "",
      "a.b",
      "a.b.c",
      "not a token",
      `${signed(PAYLOAD)}x`,
    ]) {
      expect(verifyToken(text, pair.publicKey, "device")).toBeUndefined();
    }
  });

  it("refuses a signed payload of the wrong shape", () => {
    expect(
      verifyToken(
        signed({ ...PAYLOAD, tier: "gold" }),
        pair.publicKey,
        "device"
      )
    ).toBeUndefined();
    expect(verifyToken(signed([1]), pair.publicKey, "device")).toBeUndefined();
  });

  it("keeps fields a later server adds", () => {
    expect(
      verifyToken(signed({ ...PAYLOAD, seats: 3 }), pair.publicKey, "device")
    ).toMatchObject({ seats: 3 });
  });
});

describe(publicKeyFromRaw, () => {
  it("reads the raw key a public key exports", () => {
    const raw = String(pair.publicKey.export({ format: "jwk" }).x);

    expect(
      verifyToken(signed(PAYLOAD), publicKeyFromRaw(raw), "device")
    ).toStrictEqual(PAYLOAD);
  });
});
