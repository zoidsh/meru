/**
 * Builds CRX3 packages the way the Web Store does, for tests that need a
 * package no real signing key is around for. Shared by the verifier's tests and
 * the installer's, since both need packages signed for a known id and only the
 * signing key that produced them can make one.
 */

import { createHash, createSign, generateKeyPairSync, type KeyPairSyncResult } from "node:crypto";
import { zipSync } from "fflate";
import { EXTENSION_ID_BYTE_LENGTH, getExtensionIdFromPublicKey } from "../derive/extension-id";

const SHA256_WITH_RSA_FIELD_NUMBER = 2;

const SIGNED_HEADER_DATA_FIELD_NUMBER = 10000;

const PUBLIC_KEY_FIELD_NUMBER = 1;

const SIGNATURE_FIELD_NUMBER = 2;

const CRX_ID_FIELD_NUMBER = 1;

export const ARCHIVE_FILES = {
  "manifest.json": new TextEncoder().encode('{"name":"Extension"}\n'),
};

type KeyPair = KeyPairSyncResult<Buffer, Buffer>;

function createKeyPair(): KeyPair {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
}

/** The key a package is signed with unless a test asks for another one. */
export const signingKeyPair = createKeyPair();

export const otherKeyPair = createKeyPair();

/** The id the signing key derives, which packages are signed for by default. */
export const extensionId = getExtensionIdFromPublicKey(signingKeyPair.publicKey);

/** The form a key is compared in here, which is the form a manifest carries. */
export function toBase64(key: Uint8Array) {
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

export type CrxOptions = {
  /** Every key the header carries a proof for, each signing with its own key. */
  keyPairs?: KeyPair[];
  /** The id the header is signed for, by default the signing key's. */
  crxId?: Buffer;
  archive?: Buffer;
  formatVersion?: number;
  omitSignature?: boolean;
};

export function createCrx({
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
