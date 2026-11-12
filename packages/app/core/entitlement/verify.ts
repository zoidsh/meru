import { err, ok } from "../result.ts";
import type { Result } from "../result.ts";
import { parseToken } from "./token.ts";
import type { Claims, Malformed } from "./token.ts";

/**
 * The calls of WebCrypto's `crypto.subtle` a token needs, which Node and Chromium both provide; declared here because core compiles with neither the DOM's types nor Node's. `K` is the platform's CryptoKey.
 */
export interface Ed25519Subtle<K> {
  readonly importKey: (
    format: "raw",
    keyData: Uint8Array<ArrayBuffer>,
    algorithm: "Ed25519",
    extractable: false,
    usages: ["verify"]
  ) => Promise<K>;
  readonly verify: (
    algorithm: "Ed25519",
    key: K,
    signature: Uint8Array<ArrayBuffer>,
    data: Uint8Array<ArrayBuffer>
  ) => Promise<boolean>;
}

export type VerifyError =
  | Malformed
  | { readonly kind: "unknownKey"; readonly kid: string }
  | { readonly kind: "badSignature" }
  | { readonly kind: "wrongDevice"; readonly sub: string }
  /** Signed and for this device, but past its expiry: the claims still say what the last answer was. */
  | { readonly kind: "expired"; readonly claims: Claims };

export interface VerifyOptions<K> {
  readonly subtle: Ed25519Subtle<K>;
  /** The accepted public keys by key id. */
  readonly keys: ReadonlyMap<string, K>;
  /** Milliseconds since the epoch. */
  readonly now: number;
  readonly deviceId: string;
  /** How far the device's clock may run ahead of the server's before a token counts as expired. */
  readonly skewSeconds: number;
}

/** Whether a token is past its expiry at `now`, in milliseconds, allowing the skew. */
export const isExpired = (
  claims: Pick<Claims, "exp">,
  now: number,
  skewSeconds: number
): boolean => now >= (claims.exp + skewSeconds) * 1000;

export const verifyToken = async <K>(
  text: string,
  options: VerifyOptions<K>
): Promise<Result<Claims, VerifyError>> => {
  const parsed = parseToken(text);
  if (!parsed.ok) {
    return parsed;
  }
  const { header, claims, signature, signingInput } = parsed.value;
  const key = options.keys.get(header.kid);
  if (key === undefined) {
    return err({ kid: header.kid, kind: "unknownKey" });
  }
  let valid: boolean;
  try {
    valid = await options.subtle.verify(
      "Ed25519",
      key,
      signature,
      signingInput
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    return err({ kind: "badSignature" });
  }
  if (claims.sub !== options.deviceId) {
    return err({ kind: "wrongDevice", sub: claims.sub });
  }
  if (isExpired(claims, options.now, options.skewSeconds)) {
    return err({ claims, kind: "expired" });
  }
  return ok(claims);
};
