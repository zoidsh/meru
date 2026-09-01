import fs from "node:fs";
import path from "node:path";
import { getExtensionIdFromManifestKey } from "./derive/extension-id";

const MANIFEST_FILE_NAME = "manifest.json";

/**
 * The unpacked extensions inside a directory: every direct subdirectory holding
 * a `manifest.json`, in a stable order. A directory that does not exist holds
 * no extensions.
 *
 * Symlinks are resolved, since copying a directory through a symlink copies the
 * link instead, which turns every write into the copy into a write into the
 * extension the link points at.
 *
 * Reading synchronously keeps the result usable where the loader is
 * constructed, which happens while the app is starting up.
 */
export function findExtensionDirs(dirPath: string) {
  let entryNames: string[];

  try {
    entryNames = fs.readdirSync(dirPath);
  } catch {
    return [];
  }

  return entryNames
    .sort()
    .map((entryName) => path.join(dirPath, entryName))
    .filter((extensionDir) => fs.existsSync(path.join(extensionDir, MANIFEST_FILE_NAME)))
    .map((extensionDir) => fs.realpathSync(extensionDir));
}

/**
 * The id an unpacked extension loads under, read from the `key` its manifest
 * carries, or nothing where the directory has no readable manifest or no key.
 *
 * An extension without a key has no id until Chromium derives one from the
 * directory it is loaded from, so a caller filtering on ids can only ever pass
 * one over.
 */
export function readExtensionDirId(extensionDir: string) {
  let manifest: { key?: string };

  try {
    manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, MANIFEST_FILE_NAME), "utf8")) as {
      key?: string;
    };
  } catch {
    return undefined;
  }

  return getExtensionIdFromManifestKey(manifest.key);
}
