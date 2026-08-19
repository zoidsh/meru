import { access, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { verifyCrx } from "../crx/crx";
import { compareExtensionVersions } from "../crx/version";
import { type FetchImplementation, fetchCrx, fetchCrxUpdate } from "./omaha";

const MANIFEST_FILE_NAME = "manifest.json";

/** Web Store content verification hashes, stale the moment a key is injected. */
const METADATA_DIR_NAME = "_metadata";

/**
 * What a version directory is called until it is complete. A crashed install
 * leaves one behind, and it must never be mistaken for an installed version.
 */
const STAGING_DIR_SUFFIX = ".staging";

export type InstalledExtension = {
  version: string;
  /** The unpacked directory, what an embedder hands to the loader. */
  extensionDir: string;
};

type ExtensionManifest = {
  version: string;
  key?: string;
};

type ExtensionPackage = {
  /** Every file the install writes, the manifest already carrying its key. */
  files: Record<string, Uint8Array>;
  manifest: ExtensionManifest;
};

/**
 * Turns CRX bytes into the files an install writes, refusing everything a
 * verification failure refuses.
 *
 * The archive is unpacked in memory because the version an update check
 * compares lives in the manifest inside it, and a package that turns out to be
 * one an install already has must not have touched the disk.
 */
function readCrxPackage(crx: Uint8Array, extensionId: string): ExtensionPackage {
  const { archive, publicKey } = verifyCrx(crx, extensionId);

  const files = unzipSync(archive, {
    filter: ({ name }) => !name.endsWith("/") && name.split("/")[0] !== METADATA_DIR_NAME,
  });

  const manifestSource = files[MANIFEST_FILE_NAME];

  if (!manifestSource) {
    throw new Error(`CRX for ${extensionId} carries no ${MANIFEST_FILE_NAME}`);
  }

  // Straight out of the CRX, so the fields this reads are checked below.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const manifest = JSON.parse(new TextDecoder().decode(manifestSource)) as ExtensionManifest;

  if (typeof manifest.version !== "string") {
    throw new TypeError(`CRX for ${extensionId} carries a manifest without a version`);
  }

  // An unpacked extension without a `key` loads under an id derived from its
  // directory path, and everything keyed to its real id — native messaging
  // `allowed_origins` above all — stops matching
  manifest.key = Buffer.from(publicKey).toString("base64");

  files[MANIFEST_FILE_NAME] = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);

  return { files, manifest };
}

async function writeExtensionPackage({ files }: ExtensionPackage, targetDir: string) {
  for (const [fileName, contents] of Object.entries(files)) {
    const filePath = path.join(targetDir, fileName);

    if (!filePath.startsWith(`${targetDir}${path.sep}`)) {
      throw new Error(`CRX carries "${fileName}", which unpacks outside the install directory`);
    }

    await mkdir(path.dirname(filePath), { recursive: true });

    await writeFile(filePath, contents);
  }
}

/**
 * Unpacks into a staging directory and moves it into place in one step, so a
 * failure or a crash halfway through leaves the version directory either
 * complete or absent, never half written.
 */
async function installExtensionPackage(
  extensionPackage: ExtensionPackage,
  { extensionId, installDir }: { extensionId: string; installDir: string },
): Promise<InstalledExtension> {
  const { version } = extensionPackage.manifest;

  const extensionDir = path.join(installDir, extensionId, version);

  const stagingDir = `${extensionDir}${STAGING_DIR_SUFFIX}`;

  await rm(stagingDir, { recursive: true, force: true });

  try {
    await writeExtensionPackage(extensionPackage, stagingDir);

    await rm(extensionDir, { recursive: true, force: true });

    await rename(stagingDir, extensionDir);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });

    throw error;
  }

  return { version, extensionDir };
}

export type InstallExtensionOptions = {
  crx: Uint8Array;
  /** The id Meru pinned for the extension, which the package has to be signed for. */
  extensionId: string;
  /** The directory installs live under, `<installDir>/<extensionId>/<version>`. */
  installDir: string;
};

/**
 * Installs a package that is already in hand — the download script's path, and
 * what `installLatestExtension` does once it has fetched.
 *
 * Versions are kept side by side under the id so an install never writes into
 * the directory a running session loaded, and the manifest's own version names
 * the directory so an update check can read what is installed off the disk.
 */
export async function installExtension({ crx, extensionId, installDir }: InstallExtensionOptions) {
  return installExtensionPackage(readCrxPackage(crx, extensionId), { extensionId, installDir });
}

export type InstalledExtensionOptions = {
  installDir: string;
  extensionId: string;
};

async function isUnpackedExtensionDir(dirPath: string) {
  try {
    await access(path.join(dirPath, MANIFEST_FILE_NAME));

    return true;
  } catch {
    return false;
  }
}

async function readInstalledVersions(extensionInstallDir: string) {
  let entryNames: string[];

  try {
    entryNames = await readdir(extensionInstallDir);
  } catch {
    return [];
  }

  const versions: string[] = [];

  for (const entryName of entryNames) {
    if (entryName.endsWith(STAGING_DIR_SUFFIX)) {
      continue;
    }

    if (await isUnpackedExtensionDir(path.join(extensionInstallDir, entryName))) {
      versions.push(entryName);
    }
  }

  return versions;
}

/**
 * The newest version installed for an extension, or nothing when it is not
 * installed. This is what an embedder builds its load list from at startup: the
 * disk is the record of what is installed, config only says what the user
 * opted into.
 *
 * A directory counts as a version when it holds a manifest, so an install
 * interrupted before its staging directory was moved into place is passed over
 * rather than loaded.
 */
export async function getInstalledExtension({
  installDir,
  extensionId,
}: InstalledExtensionOptions): Promise<InstalledExtension | undefined> {
  const extensionInstallDir = path.join(installDir, extensionId);

  const [latestVersion] = (await readInstalledVersions(extensionInstallDir)).toSorted(
    (version, otherVersion) => compareExtensionVersions(otherVersion, version),
  );

  if (!latestVersion) {
    return undefined;
  }

  return {
    version: latestVersion,
    extensionDir: path.join(extensionInstallDir, latestVersion),
  };
}

/**
 * Everything under the id except the version just installed: older versions,
 * and staging directories a crashed install left behind.
 *
 * Dropping an older version out from under a running session is safe because
 * sessions load a derived copy of an extension, never the install itself.
 */
async function pruneOtherVersions(extensionInstallDir: string, keptVersion: string) {
  const entryNames = await readdir(extensionInstallDir);

  for (const entryName of entryNames) {
    if (entryName !== keptVersion) {
      await rm(path.join(extensionInstallDir, entryName), { recursive: true, force: true });
    }
  }
}

export type InstallLatestExtensionOptions = InstalledExtensionOptions & {
  chromeVersion: string;
  fetch?: FetchImplementation;
};

export type LatestExtensionInstall = InstalledExtension & {
  /** False when the version already installed is the one the endpoint serves. */
  updated: boolean;
};

/**
 * Brings an extension to the version the update endpoint serves, which is both
 * how it is installed the first time and how it is kept up to date — a first
 * install is the case where nothing is installed yet.
 *
 * An install that already has a version asks the endpoint what it serves before
 * asking for it, so a check that finds nothing new costs one small answer
 * rather than a download and an unzip of tens of megabytes. The package is
 * still the last word on the version, so a download that turns out to carry
 * what is installed is written no further.
 */
export async function installLatestExtension({
  extensionId,
  installDir,
  chromeVersion,
  fetch,
}: InstallLatestExtensionOptions): Promise<LatestExtensionInstall> {
  const installedExtension = await getInstalledExtension({ installDir, extensionId });

  if (installedExtension) {
    const crxUpdate = await fetchCrxUpdate({
      extensionId,
      chromeVersion,
      installedVersion: installedExtension.version,
      fetch,
    });

    if (
      crxUpdate.status === "noupdate" ||
      compareExtensionVersions(installedExtension.version, crxUpdate.version) >= 0
    ) {
      return { ...installedExtension, updated: false };
    }
  }

  const crx = await fetchCrx({ extensionId, chromeVersion, fetch });

  const extensionPackage = readCrxPackage(crx, extensionId);

  if (
    installedExtension &&
    compareExtensionVersions(installedExtension.version, extensionPackage.manifest.version) >= 0
  ) {
    return { ...installedExtension, updated: false };
  }

  const latestExtension = await installExtensionPackage(extensionPackage, {
    extensionId,
    installDir,
  });

  await pruneOtherVersions(path.join(installDir, extensionId), latestExtension.version);

  return { ...latestExtension, updated: true };
}

/**
 * Drops every version of an extension, for when the user opts out of it. The
 * copy the loader derived from it is the embedder's to prune, and the data the
 * extension wrote lives in the session rather than here.
 */
export async function uninstallExtension({ installDir, extensionId }: InstalledExtensionOptions) {
  await rm(path.join(installDir, extensionId), { recursive: true, force: true });
}
