import { createPublicKey, createVerify, type KeyObject } from "node:crypto";
import {
  encodeExtensionId,
  EXTENSION_ID_BYTE_LENGTH,
  getExtensionIdFromPublicKey,
} from "../derive/extension-id";
import { readLengthDelimitedFields } from "./protobuf";

const CRX_MAGIC = "Cr24";

/** The magic, the format version and the header size, four bytes each. */
const CRX_PREFIX_BYTE_LENGTH = 12;

const CRX_FORMAT_VERSION = 3;

/**
 * What a CRX3 signature is taken over, ahead of the signed header data and the
 * archive. The trailing NUL is part of it.
 */
const SIGNED_DATA_MAGIC = Uint8Array.from([...new TextEncoder().encode("CRX3 SignedData"), 0]);

const SHA256_WITH_RSA_FIELD_NUMBER = 2;

const SHA256_WITH_ECDSA_FIELD_NUMBER = 3;

const SIGNED_HEADER_DATA_FIELD_NUMBER = 10000;

const PUBLIC_KEY_FIELD_NUMBER = 1;

const SIGNATURE_FIELD_NUMBER = 2;

const CRX_ID_FIELD_NUMBER = 1;

type CrxProof = {
  /** The key type the proof's field number declares, which its key has to be. */
  keyType: "rsa" | "ec";
  publicKey: Uint8Array;
  signature: Uint8Array;
};

export type VerifiedCrx = {
  /** The zip archive the CRX wraps, which is what an install unpacks. */
  archive: Uint8Array;
  /**
   * The DER SPKI public key of the proof that verified. Base64 of it is the
   * `manifest.key` an unpacked install has to carry to load under the pinned
   * id instead of one Chromium derives from its directory.
   */
  publicKey: Uint8Array;
  headerByteLength: number;
};

function readUint32Le(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function encodeUint32Le(value: number) {
  const bytes = new Uint8Array(4);

  new DataView(bytes.buffer).setUint32(0, value, true);

  return bytes;
}

function readProof(proofBytes: Uint8Array, keyType: CrxProof["keyType"]): CrxProof | undefined {
  const fields = readLengthDelimitedFields(proofBytes);

  const publicKey = fields.find((field) => field.fieldNumber === PUBLIC_KEY_FIELD_NUMBER)?.bytes;

  const signature = fields.find((field) => field.fieldNumber === SIGNATURE_FIELD_NUMBER)?.bytes;

  if (!publicKey || !signature) {
    return undefined;
  }

  return { keyType, publicKey, signature };
}

function readPublicKey(proof: CrxProof): KeyObject | undefined {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(proof.publicKey),
      format: "der",
      type: "spki",
    });

    return publicKey.asymmetricKeyType === proof.keyType ? publicKey : undefined;
  } catch {
    return undefined;
  }
}

function verifyProof(proof: CrxProof, signedContent: Uint8Array[]) {
  const publicKey = readPublicKey(proof);

  if (!publicKey) {
    return false;
  }

  const verifier = createVerify("sha256");

  for (const part of signedContent) {
    verifier.update(part);
  }

  return verifier.verify(publicKey, proof.signature);
}

/**
 * Checks a CRX3 package against the id Meru pinned for the extension and hands
 * back what installing it takes. Every failure throws, because this is a
 * password manager's update channel: a package no signature ties to the pinned
 * id must never reach a session.
 *
 * A Web Store package carries several key proofs — the publisher's key next to
 * the developer's — and only one of them derives the pinned id. That is the
 * proof whose signature has to verify and the key that becomes the install's
 * `manifest.key`; trusting the first proof instead would let any key the
 * package happens to carry vouch for it.
 */
export function verifyCrx(crx: Uint8Array, extensionId: string): VerifiedCrx {
  if (crx.byteLength < CRX_PREFIX_BYTE_LENGTH) {
    throw new Error(`CRX of ${crx.byteLength} bytes is too short to hold a header`);
  }

  const magic = new TextDecoder().decode(crx.subarray(0, CRX_MAGIC.length));

  if (magic !== CRX_MAGIC) {
    throw new Error(`CRX starts with "${magic}" instead of "${CRX_MAGIC}"`);
  }

  const formatVersion = readUint32Le(crx, 4);

  if (formatVersion !== CRX_FORMAT_VERSION) {
    throw new Error(`CRX format version ${formatVersion} is not supported`);
  }

  const headerByteLength = readUint32Le(crx, 8);

  const archiveOffset = CRX_PREFIX_BYTE_LENGTH + headerByteLength;

  if (archiveOffset > crx.byteLength) {
    throw new Error(
      `CRX header of ${headerByteLength} bytes does not fit in ${crx.byteLength} bytes`,
    );
  }

  const headerFields = readLengthDelimitedFields(
    crx.subarray(CRX_PREFIX_BYTE_LENGTH, archiveOffset),
  );

  const signedHeaderData = headerFields.find(
    (field) => field.fieldNumber === SIGNED_HEADER_DATA_FIELD_NUMBER,
  )?.bytes;

  if (!signedHeaderData) {
    throw new Error("CRX header carries no signed header data");
  }

  const crxId = readLengthDelimitedFields(signedHeaderData).find(
    (field) => field.fieldNumber === CRX_ID_FIELD_NUMBER,
  )?.bytes;

  if (crxId?.byteLength !== EXTENSION_ID_BYTE_LENGTH) {
    throw new Error(
      `CRX signed header data carries a ${crxId?.byteLength ?? 0} byte id instead of ${EXTENSION_ID_BYTE_LENGTH}`,
    );
  }

  const signedExtensionId = encodeExtensionId(crxId);

  if (signedExtensionId !== extensionId) {
    throw new Error(`CRX is signed for ${signedExtensionId} instead of ${extensionId}`);
  }

  const archive = crx.subarray(archiveOffset);

  const signedContent = [
    SIGNED_DATA_MAGIC,
    encodeUint32Le(signedHeaderData.byteLength),
    signedHeaderData,
    archive,
  ];

  const proofs = headerFields
    .map((field) => {
      if (field.fieldNumber === SHA256_WITH_RSA_FIELD_NUMBER) {
        return readProof(field.bytes, "rsa");
      }

      return field.fieldNumber === SHA256_WITH_ECDSA_FIELD_NUMBER
        ? readProof(field.bytes, "ec")
        : undefined;
    })
    .filter((proof) => proof !== undefined);

  const pinnedProofs = proofs.filter(
    (proof) => getExtensionIdFromPublicKey(proof.publicKey) === extensionId,
  );

  if (pinnedProofs.length === 0) {
    throw new Error(`None of the ${proofs.length} keys in the CRX derives ${extensionId}`);
  }

  const verifiedProof = pinnedProofs.find((proof) => verifyProof(proof, signedContent));

  if (!verifiedProof) {
    throw new Error(`No signature by the key deriving ${extensionId} verifies the CRX`);
  }

  return { archive, publicKey: verifiedProof.publicKey, headerByteLength };
}
