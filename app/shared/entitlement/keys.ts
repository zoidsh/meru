import { decodeBase64Url } from "../../core/entitlement/token.ts";
import type { Ed25519Subtle } from "../../core/entitlement/verify.ts";

/** Raw Ed25519 public keys, base64url, by key id. */
export type PublicKeys = Readonly<Record<string, string>>;

/** The keys the API signs with. A new key is added by a release before the API switches to it, and one is dropped only once no token it signed can still be stored. */
export const productionKeys: PublicKeys = {};

export const DEV_KID = "dev-2026-11";

/** Signs the tokens of `scripts/entitlement/sign.ts` and the end-to-end stub; its private key is in the repository, so only a run from the repository accepts it. */
export const developmentKeys: PublicKeys = {
  [DEV_KID]: "PtbAtjqQvbURkrmlUEYoojWK0QoCABT25v4q5k2gUHE",
};

export const acceptedKeys = (packaged: boolean): PublicKeys =>
  packaged ? productionKeys : { ...productionKeys, ...developmentKeys };

/** Imports each key for verifying; a key that does not decode or import is left out. */
export const importKeys = async <K>(
  subtle: Ed25519Subtle<K>,
  keys: PublicKeys
): Promise<Map<string, K>> => {
  const imported = await Promise.all(
    Object.entries(keys).map(async ([kid, text]) => {
      const raw = decodeBase64Url(text);
      if (raw === undefined) {
        return [];
      }
      try {
        const key = await subtle.importKey("raw", raw, "Ed25519", false, [
          "verify",
        ]);
        const entry: [string, K] = [kid, key];
        return [entry];
      } catch {
        return [];
      }
    })
  );
  return new Map(imported.flat());
};
