import { createHash } from "node:crypto";

const ID_ALPHABET_OFFSET = "a".charCodeAt(0);

/**
 * The id Chromium gives an extension whose manifest carries a `key`: the first
 * 16 bytes of the key's sha256, written in the a-p alphabet extension ids use
 * instead of hexadecimal.
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

  const digest = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);

  return Array.from(digest, (digit) =>
    String.fromCharCode(ID_ALPHABET_OFFSET + Number.parseInt(digit, 16)),
  ).join("");
}
