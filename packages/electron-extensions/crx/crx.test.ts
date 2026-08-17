import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import { getExtensionIdFromPublicKey } from "../derive/extension-id";
import { verifyCrx } from "./crx";
import {
  ARCHIVE_FILES,
  createCrx,
  extensionId,
  otherKeyPair,
  signingKeyPair,
  toBase64,
} from "./crx-fixture";

describe("verifyCrx", () => {
  test("returns the archive of a package signed for the pinned id", () => {
    const crx = createCrx();

    const { archive, publicKey, headerByteLength } = verifyCrx(crx, extensionId);

    expect(Object.keys(unzipSync(archive))).toEqual(["manifest.json"]);
    expect(toBase64(publicKey)).toBe(toBase64(signingKeyPair.publicKey));
    expect(headerByteLength).toBe(crx.byteLength - archive.byteLength - 12);
  });

  test("picks the proof deriving the pinned id over the one that comes first", () => {
    const { publicKey } = verifyCrx(
      createCrx({ keyPairs: [otherKeyPair, signingKeyPair] }),
      extensionId,
    );

    expect(toBase64(publicKey)).toBe(toBase64(signingKeyPair.publicKey));
  });

  test("refuses a package whose archive was changed after signing", () => {
    const crx = createCrx();

    const tamperedByteOffset = crx.byteLength - 8;

    crx[tamperedByteOffset] = (crx[tamperedByteOffset] as number) ^ 0xff;

    expect(() => verifyCrx(crx, extensionId)).toThrow(
      `No signature by the key deriving ${extensionId} verifies the CRX`,
    );
  });

  test("refuses a package signed for another id", () => {
    const otherExtensionId = getExtensionIdFromPublicKey(otherKeyPair.publicKey);

    expect(() => verifyCrx(createCrx(), otherExtensionId)).toThrow(
      `CRX is signed for ${extensionId} instead of ${otherExtensionId}`,
    );
  });

  test("refuses a package whose keys do not derive the id it is signed for", () => {
    const crx = createCrx({
      keyPairs: [otherKeyPair],
    });

    expect(() => verifyCrx(crx, extensionId)).toThrow(
      `None of the 1 keys in the CRX derives ${extensionId}`,
    );
  });

  test("refuses a proof without a signature", () => {
    expect(() => verifyCrx(createCrx({ omitSignature: true }), extensionId)).toThrow(
      `None of the 0 keys in the CRX derives ${extensionId}`,
    );
  });

  test("refuses a corrupted signature", () => {
    const crx = createCrx();

    const signatureByteOffset = crx.indexOf(signingKeyPair.publicKey) + 300;

    crx[signatureByteOffset] = (crx[signatureByteOffset] as number) ^ 0xff;

    expect(() => verifyCrx(crx, extensionId)).toThrow(
      `No signature by the key deriving ${extensionId} verifies the CRX`,
    );
  });

  test("refuses a buffer too short to hold a header", () => {
    expect(() => verifyCrx(createCrx().subarray(0, 8), extensionId)).toThrow(
      "CRX of 8 bytes is too short to hold a header",
    );
  });

  test("refuses a package truncated in the middle of its header", () => {
    expect(() => verifyCrx(createCrx().subarray(0, 32), extensionId)).toThrow(
      "does not fit in 32 bytes",
    );
  });

  test("refuses a header claiming more bytes than the package has", () => {
    const crx = createCrx();

    crx.writeUInt32LE(crx.byteLength, 8);

    expect(() => verifyCrx(crx, extensionId)).toThrow(/does not fit in/);
  });

  test("refuses something that is not a CRX", () => {
    expect(() => verifyCrx(Buffer.from(zipSync(ARCHIVE_FILES)), extensionId)).toThrow(
      'instead of "Cr24"',
    );
  });

  test("refuses a CRX2 package", () => {
    expect(() => verifyCrx(createCrx({ formatVersion: 2 }), extensionId)).toThrow(
      "CRX format version 2 is not supported",
    );
  });
});

/**
 * The package `bun run extensions:download` leaves behind, which is a real Web
 * Store CRX carrying three proofs. It is absent on a fresh checkout and in CI.
 */
const onePasswordCrxPath = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "extensions",
  "1password.crx",
);

describe("verifyCrx with a Web Store package", () => {
  test.skipIf(!existsSync(onePasswordCrxPath))("verifies the 1Password package", () => {
    const { archive, publicKey } = verifyCrx(
      readFileSync(onePasswordCrxPath),
      "aeblfdkhhhdcdjpifhhbdiojplfjncoa",
    );

    expect(getExtensionIdFromPublicKey(publicKey)).toBe("aeblfdkhhhdcdjpifhhbdiojplfjncoa");
    expect(Object.keys(unzipSync(archive))).toContain("manifest.json");
  });
});
