import fs from "node:fs";
import path from "node:path";

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
    .toSorted()
    .map((entryName) => path.join(dirPath, entryName))
    .filter((extensionDir) => fs.existsSync(path.join(extensionDir, MANIFEST_FILE_NAME)))
    .map((extensionDir) => fs.realpathSync(extensionDir));
}
