import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  normalizeLinuxId,
  parseIoregOutput,
  parseRegOutput,
} from "#core/device-id.ts";

const run = promisify(execFile);

// The window waits on the id; one that does not come in time reads as none.
const READ_TIMEOUT = 3000;

const LINUX_ID_FILES = ["/var/lib/dbus/machine-id", "/etc/machine-id"];

const readLinuxId = async () => {
  const contents = await Promise.all(
    LINUX_ID_FILES.map((file) => readFile(file, "utf-8").catch(() => ""))
  );
  const found = contents.find(Boolean);

  return found === undefined ? hostname() : (found.split("\n")[0] ?? "");
};

const readPlatformId = async () => {
  if (process.platform === "darwin") {
    const { stdout } = await run(
      "ioreg",
      ["-rd1", "-c", "IOPlatformExpertDevice"],
      { timeout: READ_TIMEOUT }
    );

    return parseIoregOutput(stdout);
  }

  if (process.platform === "win32") {
    const systemRoot =
      process.env.SystemRoot ?? process.env.windir ?? String.raw`C:\Windows`;
    const { stdout } = await run(
      path.join(systemRoot, "System32", "reg.exe"),
      [
        "QUERY",
        String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography`,
        "/v",
        "MachineGuid",
      ],
      { timeout: READ_TIMEOUT }
    );

    return parseRegOutput(stdout);
  }

  return normalizeLinuxId(await readLinuxId());
};

/** A platform's own id as the license server knows the device: hashed, as v3 hashes it. */
export const hashPlatformId = (id: string) =>
  createHash("sha256").update(id).digest("hex");

/** This computer's id as the license server knows it. */
export const readDeviceId = async () => hashPlatformId(await readPlatformId());
