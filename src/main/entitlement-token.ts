// In main rather than core: it needs node:crypto, and core runs in the
// renderers too.
import { createPublicKey, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";

import { entitlementSchema } from "#core/entitlement.ts";
import type { Entitlement } from "#core/entitlement.ts";

/** An Ed25519 public key as the 32 raw bytes, base64url. */
export const publicKeyFromRaw = (raw: string): KeyObject =>
  createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: raw },
    format: "jwk",
  });

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Not JSON: no token.
  }
};

/**
 * The token's payload, `<payload>.<signature>` in base64url with an Ed25519
 * signature over the payload's bytes, when the signature holds under
 * `publicKey` and the token is this device's; else `undefined`.
 */
export const verifyToken = (
  token: string,
  publicKey: KeyObject,
  deviceId: string
): Entitlement | undefined => {
  const parts = token.split(".");

  if (parts.length !== 2) {
    return;
  }

  const [payload = "", signature = ""] = parts;
  const payloadBytes = Buffer.from(payload, "base64url");
  const signatureBytes = Buffer.from(signature, "base64url");

  let signed = false;

  try {
    signed = verify(null, payloadBytes, publicKey, signatureBytes);
  } catch {
    // A signature of the wrong length throws rather than failing.
  }

  if (!signed) {
    return;
  }

  const result = entitlementSchema.safeParse(
    parseJson(payloadBytes.toString("utf-8"))
  );

  return result.success && result.data.deviceId === deviceId
    ? result.data
    : undefined;
};
