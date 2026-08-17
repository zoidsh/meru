import { createHash } from "node:crypto";

const ID_ALPHABET_OFFSET = "a".charCodeAt(0);

/** An id is the first half of a sha256 digest, a character per nibble. */
export const EXTENSION_ID_BYTE_LENGTH = 16;

/**
 * The a-p alphabet Chromium writes extension ids in, a character per nibble of
 * the 16 bytes an id is made of.
 *
 * A CRX names the extension it is signed for with those bytes rather than with
 * the id, so the mapping is what ties a package to the id Meru pinned for it.
 */
export function encodeExtensionId(idBytes: Uint8Array) {
  return Array.from(idBytes.subarray(0, EXTENSION_ID_BYTE_LENGTH), (byte) =>
    String.fromCharCode(ID_ALPHABET_OFFSET + (byte >> 4), ID_ALPHABET_OFFSET + (byte & 0xf)),
  ).join("");
}

/**
 * The id Chromium gives an extension published under a key: the first 16 bytes
 * of the key's sha256. The key is the DER SPKI public key, which is what a
 * manifest carries base64-encoded in `key` and what a CRX carries in its
 * signature proofs.
 */
export function getExtensionIdFromPublicKey(publicKey: Uint8Array) {
  return encodeExtensionId(createHash("sha256").update(publicKey).digest());
}

/**
 * The id Chromium gives an extension whose manifest carries a `key`.
 *
 * Knowing the id before the extension is loaded is what lets the loader address
 * the extension's own storage in a session. An extension without a `key` has no
 * id until Chromium generates one from the directory it is loaded from, so it
 * has none here.
 */
export function getExtensionIdFromManifestKey(key: string | undefined) {
  if (!key) {
    return undefined;
  }

  return getExtensionIdFromPublicKey(Buffer.from(key, "base64"));
}
