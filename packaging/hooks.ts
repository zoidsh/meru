import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * electron-builder hands `APPLE_API_KEY` to notarytool's `--key`, which takes only a path, while a GitHub secret carries the key's contents. So a key given as contents is written to a private temporary file, removed when the process exits, failed builds included, and the variable is pointed at it. A path is left as it is.
 */
export const writeNotarizationKey = (
  env: Record<string, string | undefined> = process.env,
  parent: string = tmpdir()
): string | undefined => {
  const key = env.APPLE_API_KEY;
  const keyId = env.APPLE_API_KEY_ID;
  if (key?.startsWith("-----BEGIN") !== true || keyId === undefined) {
    return undefined;
  }
  const dir = mkdtempSync(path.join(parent, "meru-notarization-"));
  const keyPath = path.join(dir, `AuthKey_${keyId}.p8`);
  writeFileSync(keyPath, key, { mode: 0o600 });
  process.once("exit", () => {
    rmSync(dir, { force: true, recursive: true });
  });
  env.APPLE_API_KEY = keyPath;
  return keyPath;
};
