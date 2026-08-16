/**
 * Downloads the curated extensions into `extensions/` at the repository root,
 * which a development build loads into every account session.
 *
 * This is a development convenience that trusts the Chrome Web Store over TLS:
 * it does not verify the CRX signature, which is the job of the install
 * pipeline the app ships.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { unzipSync } from "fflate";

type CuratedExtension = {
  /** The directory the extension is unpacked into. */
  name: string;
  /** The Chrome Web Store id, which the injected key has to derive. */
  id: string;
};

const CURATED_EXTENSIONS: CuratedExtension[] = [
  { name: "1password", id: "aeblfdkhhhdcdjpifhhbdiojplfjncoa" },
];

// Keep in sync with Electron
const CHROME_VERSION = "146.0.0.0";

const MANIFEST_FILE_NAME = "manifest.json";

const args = parseArgs({
  args: Bun.argv,
  options: {
    force: {
      type: "boolean",
    },
  },
  strict: true,
  allowPositionals: true,
});

const extensionsDir = path.join(import.meta.dirname, "..", "extensions");

/** Omaha answers 204 No Content until it knows which Chrome is asking. */
function buildUpdateUrl(id: string) {
  const searchParams = new URLSearchParams({
    response: "redirect",
    os: "linux",
    arch: "x64",
    os_arch: "x86_64",
    nacl_arch: "x86-64",
    prod: "chromiumcrx",
    prodchannel: "unknown",
    prodversion: CHROME_VERSION,
    acceptformat: "crx2,crx3",
    x: `id=${id}&installsource=ondemand&uc`,
  });

  return `https://clients2.google.com/service/update2/crx?${searchParams}`;
}

function findZipOffset(crx: Buffer, headerSize: number) {
  const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

  const declaredOffset = 12 + headerSize;

  if (crx.subarray(declaredOffset, declaredOffset + 4).equals(zipMagic)) {
    return declaredOffset;
  }

  const scannedOffset = crx.indexOf(zipMagic, 12);

  if (scannedOffset === -1) {
    throw new Error("No zip payload found after the CRX header");
  }

  return scannedOffset;
}

function readVarint(message: Buffer, offset: number) {
  let value = 0;

  let shift = 0;

  let cursor = offset;

  while (cursor < message.byteLength) {
    const byte = message[cursor] as number;

    cursor += 1;

    value += (byte & 0x7f) * 2 ** shift;

    if ((byte & 0x80) === 0) {
      break;
    }

    shift += 7;
  }

  return { value, nextOffset: cursor };
}

function readLengthDelimitedFields(message: Buffer) {
  const fields: { fieldNumber: number; bytes: Buffer }[] = [];

  let cursor = 0;

  while (cursor < message.byteLength) {
    const { value: fieldKey, nextOffset } = readVarint(message, cursor);

    cursor = nextOffset;

    const fieldNumber = fieldKey >>> 3;

    const wireType = fieldKey & 0x7;

    if (wireType !== 2) {
      // Only varints appear alongside the proofs, so skipping them suffices here
      cursor = readVarint(message, cursor).nextOffset;

      continue;
    }

    const { value: fieldLength, nextOffset: afterLength } = readVarint(message, cursor);

    fields.push({ fieldNumber, bytes: message.subarray(afterLength, afterLength + fieldLength) });

    cursor = afterLength + fieldLength;
  }

  return fields;
}

function deriveExtensionId(publicKey: Buffer) {
  const digest = createHash("sha256").update(publicKey).digest().subarray(0, 16);

  let id = "";

  for (const byte of digest) {
    id += String.fromCharCode(97 + (byte >> 4));

    id += String.fromCharCode(97 + (byte & 0xf));
  }

  return id;
}

/**
 * The publishing key of an extension, which a Web Store package carries next to
 * the developer's key. Only one of the proofs derives the id the extension is
 * known by, and the manifest needs that one: an unpacked extension without a
 * `key` loads under an id derived from its directory path, and everything keyed
 * to its real id — native messaging `allowed_origins` above all — stops
 * matching.
 */
function findPublicKey(crxHeader: Buffer, id: string) {
  const publicKeys = readLengthDelimitedFields(crxHeader)
    .filter((field) => field.fieldNumber === 2 || field.fieldNumber === 3)
    .map((proof) => readLengthDelimitedFields(proof.bytes)[0]?.bytes)
    .filter((publicKey) => publicKey !== undefined);

  const publicKey = publicKeys.find((candidateKey) => deriveExtensionId(candidateKey) === id);

  if (!publicKey) {
    throw new Error(`None of the ${publicKeys.length} keys in the CRX derives ${id}`);
  }

  return publicKey;
}

async function unpackZip(zip: Buffer, targetDir: string) {
  for (const [fileName, contents] of Object.entries(unzipSync(zip))) {
    if (fileName.endsWith("/")) {
      continue;
    }

    const filePath = path.join(targetDir, fileName);

    await mkdir(path.dirname(filePath), { recursive: true });

    await writeFile(filePath, contents);
  }
}

async function downloadExtension({ name, id }: CuratedExtension) {
  const response = await fetch(buildUpdateUrl(id), { redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Update endpoint answered ${response.status} ${response.statusText}`);
  }

  const crx = Buffer.from(await response.arrayBuffer());

  if (crx.subarray(0, 4).toString("ascii") !== "Cr24") {
    throw new Error(`${response.url} did not answer with a CRX`);
  }

  const headerSize = crx.readUInt32LE(8);

  const extensionDir = path.join(extensionsDir, name);

  const stagingDir = `${extensionDir}.staging`;

  await rm(stagingDir, { recursive: true, force: true });

  await unpackZip(crx.subarray(findZipOffset(crx, headerSize)), stagingDir);

  const manifestPath = path.join(stagingDir, MANIFEST_FILE_NAME);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    version: string;
    key: string;
  };

  manifest.key = findPublicKey(crx.subarray(12, 12 + headerSize), id).toString("base64");

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // Web Store content verification hashes, stale the moment the key is injected
  await rm(path.join(stagingDir, "_metadata"), { recursive: true, force: true });

  await rm(extensionDir, { recursive: true, force: true });

  await rename(stagingDir, extensionDir);

  console.log(`${name}: unpacked version ${manifest.version} as ${id}`);
}

for (const extension of CURATED_EXTENSIONS) {
  if (
    !args.values.force &&
    existsSync(path.join(extensionsDir, extension.name, MANIFEST_FILE_NAME))
  ) {
    console.log(`${extension.name}: already downloaded, --force downloads it again`);

    continue;
  }

  await downloadExtension(extension);
}
