/**
 * Downloads the curated extensions into `extensions/` at the repository root,
 * which a development build loads into every account session.
 *
 * Each package is verified against the id it is curated under before anything
 * is unpacked, the way the install pipeline the app ships verifies it, and the
 * CRX is kept next to the unpacked directory as a real-package test fixture.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
// The crx and install entries, since the package's own entry reaches into Electron
import { verifyCrx } from "@meru/electron-extensions/crx";
import { fetchCrx } from "@meru/electron-extensions/install";
import { type CuratedExtension, curatedExtensions } from "@meru/shared/extensions";
import { unzipSync } from "fflate";

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

async function unpackZip(zip: Uint8Array, targetDir: string) {
  for (const [fileName, contents] of Object.entries(unzipSync(zip))) {
    if (fileName.endsWith("/")) {
      continue;
    }

    const filePath = path.join(targetDir, fileName);

    await mkdir(path.dirname(filePath), { recursive: true });

    await writeFile(filePath, contents);
  }
}

/** The directory an extension is unpacked into, `extensions/1password`. */
function getDirectoryName({ name }: CuratedExtension) {
  return name.toLowerCase();
}

async function downloadExtension(extension: CuratedExtension) {
  const { name, id } = extension;

  const directoryName = getDirectoryName(extension);

  const crx = await fetchCrx({ extensionId: id, chromeVersion: CHROME_VERSION });

  const { archive, publicKey } = verifyCrx(crx, id);

  await mkdir(extensionsDir, { recursive: true });

  // Kept as a fixture the verifier can be tested against a real package with
  await writeFile(path.join(extensionsDir, `${directoryName}.crx`), crx);

  const extensionDir = path.join(extensionsDir, directoryName);

  const stagingDir = `${extensionDir}.staging`;

  await rm(stagingDir, { recursive: true, force: true });

  await unpackZip(archive, stagingDir);

  const manifestPath = path.join(stagingDir, MANIFEST_FILE_NAME);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    version: string;
    key: string;
  };

  // An unpacked extension without a `key` loads under an id derived from its
  // directory path, and everything keyed to its real id — native messaging
  // `allowed_origins` above all — stops matching
  manifest.key = Buffer.from(publicKey).toString("base64");

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // Web Store content verification hashes, stale the moment the key is injected
  await rm(path.join(stagingDir, "_metadata"), { recursive: true, force: true });

  await rm(extensionDir, { recursive: true, force: true });

  await rename(stagingDir, extensionDir);

  console.log(`${name}: unpacked version ${manifest.version} as ${id}`);
}

for (const extension of curatedExtensions) {
  if (
    !args.values.force &&
    existsSync(path.join(extensionsDir, getDirectoryName(extension), MANIFEST_FILE_NAME))
  ) {
    console.log(`${extension.name}: already downloaded, --force downloads it again`);

    continue;
  }

  await downloadExtension(extension);
}
