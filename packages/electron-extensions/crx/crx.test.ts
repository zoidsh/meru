import { describe, expect, test } from "bun:test";
import { createHash, createSign, generateKeyPairSync, type KeyPairSyncResult } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import { EXTENSION_ID_BYTE_LENGTH, getExtensionIdFromPublicKey } from "../derive/extension-id";
import { verifyCrx } from "./crx";

const SHA256_WITH_RSA_FIELD_NUMBER = 2;

const SIGNED_HEADER_DATA_FIELD_NUMBER = 10000;

const PUBLIC_KEY_FIELD_NUMBER = 1;

const SIGNATURE_FIELD_NUMBER = 2;

const CRX_ID_FIELD_NUMBER = 1;

const ARCHIVE_FILES = { "manifest.json": new TextEncoder().encode('{"name":"Extension"}\n') };

type KeyPair = KeyPairSyncResult<Buffer, Buffer>;

function createKeyPair(): KeyPair {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
}

const signingKeyPair = createKeyPair();

const otherKeyPair = createKeyPair();

const extensionId = getExtensionIdFromPublicKey(signingKeyPair.publicKey);

/** The form a key is compared in here, which is the form a manifest carries. */
function toBase64(key: Uint8Array) {
  return Buffer.from(key).toString("base64");
}

function encodeVarint(value: number) {
  const bytes: number[] = [];

  let remaining = value;

  do {
    const byte = remaining % 0x80;

    remaining = Math.floor(remaining / 0x80);

    bytes.push(remaining > 0 ? byte | 0x80 : byte);
  } while (remaining > 0);

  return Buffer.from(bytes);
}

function encodeField(fieldNumber: number, bytes: Uint8Array) {
  return Buffer.concat([
    encodeVarint(fieldNumber * 8 + 2),
    encodeVarint(bytes.byteLength),
    Buffer.from(bytes),
  ]);
}

function encodeUint32Le(value: number) {
  const bytes = Buffer.alloc(4);

  bytes.writeUInt32LE(value);

  return bytes;
}

function sign(privateKey: Buffer, signedContent: Buffer) {
  return createSign("sha256")
    .update(signedContent)
    .sign({ key: privateKey, format: "der", type: "pkcs8" });
}

type CrxOptions = {
  /** Every key the header carries a proof for, each signing with its own key. */
  keyPairs?: KeyPair[];
  /** The id the header is signed for, by default the signing key's. */
  crxId?: Buffer;
  archive?: Buffer;
  formatVersion?: number;
  omitSignature?: boolean;
};

function createCrx({
  keyPairs = [signingKeyPair],
  crxId = createHash("sha256")
    .update(signingKeyPair.publicKey)
    .digest()
    .subarray(0, EXTENSION_ID_BYTE_LENGTH),
  archive = Buffer.from(zipSync(ARCHIVE_FILES)),
  formatVersion = 3,
  omitSignature = false,
}: CrxOptions = {}) {
  const signedHeaderData = encodeField(CRX_ID_FIELD_NUMBER, crxId);

  const signedContent = Buffer.concat([
    Buffer.from("CRX3 SignedData", "utf8"),
    Buffer.from([0]),
    encodeUint32Le(signedHeaderData.byteLength),
    signedHeaderData,
    archive,
  ]);

  const proofs = keyPairs.map((keyPair) =>
    encodeField(
      SHA256_WITH_RSA_FIELD_NUMBER,
      Buffer.concat([
        encodeField(PUBLIC_KEY_FIELD_NUMBER, keyPair.publicKey),
        ...(omitSignature
          ? []
          : [encodeField(SIGNATURE_FIELD_NUMBER, sign(keyPair.privateKey, signedContent))]),
      ]),
    ),
  );

  const header = Buffer.concat([
    ...proofs,
    encodeField(SIGNED_HEADER_DATA_FIELD_NUMBER, signedHeaderData),
  ]);

  return Buffer.concat([
    Buffer.from("Cr24", "ascii"),
    encodeUint32Le(formatVersion),
    encodeUint32Le(header.byteLength),
    header,
    archive,
  ]);
}

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
