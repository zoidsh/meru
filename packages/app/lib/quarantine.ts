import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Builds a `com.apple.quarantine` value: flags, timestamp, agent name and the
 * event UUID that ties the file to a row in Launch Services' download history,
 * which Meru keeps itself and so leaves empty.
 */
export function buildQuarantineAttributeValue(downloadedAt: Date) {
  return `0081;${Math.floor(downloadedAt.getTime() / 1000).toString(16)};Meru;`;
}

/**
 * Chromium quarantines a download in-process on Windows only and otherwise
 * expects a quarantine service from the embedder, which Electron does not
 * supply, so Gatekeeper never checks a file Meru downloads without this.
 */
export async function quarantineFile(filePath: string, downloadedAt = new Date()) {
  await execFileAsync("/usr/bin/xattr", [
    "-w",
    "com.apple.quarantine",
    buildQuarantineAttributeValue(downloadedAt),
    "--",
    filePath,
  ]);
}
