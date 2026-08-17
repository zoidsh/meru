import { createHash, randomUUID } from "node:crypto";
import { cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { EXTENSION_BRIDGE_SCHEME, EXTENSION_BRIDGE_TOKEN_GLOBAL } from "../bridge/protocol";
import { getExtensionIdFromManifestKey } from "./extension-id";
import { injectFacadeScript } from "./html";
import { deriveManifest, type ExtensionManifest } from "./manifest";

const MANIFEST_FILE_NAME = "manifest.json";

/** What the stamp next to a derived copy is called: `<derivedDir>.json`. */
const STAMP_FILE_EXTENSION = ".json";

const FACADE_FILE_NAME = "chrome-facade.js";

const SERVICE_WORKER_FILE_NAME = "chrome-facade-service-worker.js";

/** Bump whenever what is written into a derived copy changes. */
const DERIVE_VERSION = 4;

export type DeriveExtensionOptions = {
  /** The unpacked extension the embedder handed over, never written to. */
  sourceDir: string;
  derivedExtensionsDir: string;
  facadeScriptPath: string;
  /**
   * Manifest keys the copy is derived without, to run an extension with one of
   * its parts taken away — `content_scripts`, `declarative_net_request` — and
   * see what changes.
   */
  strippedManifestKeys?: string[];
  /**
   * Match patterns the extension's content scripts are clamped to, asked for by
   * the id the copy will be loaded as. An extension without a `manifest.key`
   * has no id to be recognised by and keeps the patterns its author declared.
   */
  getContentScriptMatches?: (extensionId: string) => string[] | undefined;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Digests the source tree from each file's path, size and mtime — never its
 * contents, since an extension runs to tens of megabytes and this happens on
 * every launch, and an edit always moves one of the two.
 */
async function hashSourceTree(sourceDir: string) {
  const entryNames = await readdir(sourceDir, { recursive: true });

  const fileEntries: string[] = [];

  for (const entryName of entryNames) {
    const stats = await stat(path.join(sourceDir, entryName));

    if (!stats.isFile()) {
      continue;
    }

    const relativePath = entryName.split(path.sep).join("/");

    fileEntries.push(`${relativePath}\0${stats.size}\0${stats.mtimeMs}`);
  }

  return hash(fileEntries.sort().join("\n"));
}

async function readStamp(stampPath: string) {
  try {
    return await readFile(stampPath, "utf8");
  } catch {
    return null;
  }
}

/** Chromium serves `Popup.HTM` as a page just as well, so the net is this wide. */
const PAGE_FILE_EXTENSIONS = new Set([".html", ".htm"]);

async function injectFacadeIntoPages(derivedDir: string) {
  const fileNames = await readdir(derivedDir, { recursive: true });

  for (const fileName of fileNames) {
    if (!PAGE_FILE_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
      continue;
    }

    const pagePath = path.join(derivedDir, fileName);

    const page = await readFile(pagePath, "utf8");

    await writeFile(pagePath, injectFacadeScript(page, `/${FACADE_FILE_NAME}`));
  }
}

/**
 * Copies an unpacked extension into a directory the loader owns and adds the
 * `chrome.*` facade to it: the service worker gets a wrapper that pulls the
 * facade in ahead of the extension's background script, and every extension
 * page gets a script tag doing the same.
 *
 * The copy exists because the facade has to be part of the extension to run in
 * its contexts, and the directory the embedder handed over is not the loader's
 * to write to — it is a verified install, or a directory a developer is working
 * in. The copy sits at a path derived from the source path, so an extension
 * without a `manifest.key` keeps the same generated id across launches.
 *
 * The facade is written rather than copied so that this extension's copy can
 * carry the token its native messaging bridge requests are recognised by.
 */
export async function deriveExtension({
  sourceDir,
  derivedExtensionsDir,
  facadeScriptPath,
  strippedManifestKeys = [],
  getContentScriptMatches,
}: DeriveExtensionOptions) {
  const manifestSource = await readFile(path.join(sourceDir, MANIFEST_FILE_NAME), "utf8");

  const sourceManifest = JSON.parse(manifestSource) as ExtensionManifest;

  const extensionId = getExtensionIdFromManifestKey(sourceManifest.key);

  const contentScriptMatches = extensionId ? getContentScriptMatches?.(extensionId) : undefined;

  const derivedDir = path.join(derivedExtensionsDir, hash(sourceDir).slice(0, 16));

  const stampPath = `${derivedDir}${STAMP_FILE_EXTENSION}`;

  // The source is copied again when any of its files changes, which is what an
  // installed extension moving to a new version does and what a developer
  // working in an unpacked one does, and when what the derive makes of it
  // changes
  const stamp = JSON.stringify({
    deriveVersion: DERIVE_VERSION,
    sourceDir,
    sourceTree: await hashSourceTree(sourceDir),
    strippedManifestKeys,
    contentScriptMatches,
  });

  if ((await readStamp(stampPath)) !== stamp) {
    await rm(derivedDir, { recursive: true, force: true });

    await rm(stampPath, { force: true });

    await cp(sourceDir, derivedDir, { recursive: true });

    const { manifest, serviceWorkerWrapper } = deriveManifest(sourceManifest, {
      facadeFileName: FACADE_FILE_NAME,
      serviceWorkerFileName: SERVICE_WORKER_FILE_NAME,
      bridgeConnectSource: `${EXTENSION_BRIDGE_SCHEME}:`,
      strippedManifestKeys,
      contentScriptMatches,
    });

    await writeFile(path.join(derivedDir, MANIFEST_FILE_NAME), JSON.stringify(manifest, null, 2));

    if (serviceWorkerWrapper) {
      await writeFile(path.join(derivedDir, SERVICE_WORKER_FILE_NAME), serviceWorkerWrapper);
    }

    await injectFacadeIntoPages(derivedDir);

    await writeFile(stampPath, stamp);
  }

  // Always, so a rebuilt facade reaches copies that are otherwise up to date
  const bridgeToken = randomUUID();

  await writeFile(
    path.join(derivedDir, FACADE_FILE_NAME),
    `globalThis.${EXTENSION_BRIDGE_TOKEN_GLOBAL} = ${JSON.stringify(bridgeToken)};\n${await readFile(
      facadeScriptPath,
      "utf8",
    )}`,
  );

  return { derivedDir, bridgeToken, extensionId };
}

export type PruneDerivedExtensionsOptions = {
  derivedExtensionsDir: string;
  /**
   * The source directories still being loaded. A copy derived from anything
   * else is gone for good, since nothing but the source it names can recreate
   * it.
   */
  keptSourceDirs: string[];
};

async function readStampSourceDir(stampPath: string) {
  const stamp = await readStamp(stampPath);

  if (!stamp) {
    return undefined;
  }

  try {
    return (JSON.parse(stamp) as { sourceDir?: string }).sourceDir;
  } catch {
    return undefined;
  }
}

/**
 * Drops the derived copies of extensions the embedder no longer loads: the
 * version directory an update replaced, an extension the user opted out of, a
 * development extension whose folder is gone. Nothing points back from a copy
 * to its source but its stamp, so a copy without one is unaccounted for and
 * goes too.
 *
 * Meant to run once the embedder knows its load list, which is also why it is
 * safe to delete: a copy still in use belongs to a source that is on the list.
 */
export async function pruneDerivedExtensions({
  derivedExtensionsDir,
  keptSourceDirs,
}: PruneDerivedExtensionsOptions) {
  let entryNames: string[];

  try {
    entryNames = await readdir(derivedExtensionsDir);
  } catch {
    return;
  }

  const derivedDirNames = new Set(
    entryNames.map((entryName) =>
      entryName.endsWith(STAMP_FILE_EXTENSION)
        ? entryName.slice(0, -STAMP_FILE_EXTENSION.length)
        : entryName,
    ),
  );

  for (const derivedDirName of derivedDirNames) {
    const derivedDir = path.join(derivedExtensionsDir, derivedDirName);

    const stampPath = `${derivedDir}${STAMP_FILE_EXTENSION}`;

    const sourceDir = await readStampSourceDir(stampPath);

    if (sourceDir !== undefined && keptSourceDirs.includes(sourceDir)) {
      continue;
    }

    await rm(derivedDir, { recursive: true, force: true });

    await rm(stampPath, { force: true });
  }
}
