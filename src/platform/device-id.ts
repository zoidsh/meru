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
    const { stdout } = await run("ioreg", [
      "-rd1",
      "-c",
      "IOPlatformExpertDevice",
    ]);

    return parseIoregOutput(stdout);
  }

  if (process.platform === "win32") {
    const systemRoot =
      process.env.SystemRoot ?? process.env.windir ?? String.raw`C:\Windows`;
    const { stdout } = await run(path.join(systemRoot, "System32", "reg.exe"), [
      "QUERY",
      String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography`,
      "/v",
      "MachineGuid",
    ]);

    return parseRegOutput(stdout);
  }

  return normalizeLinuxId(await readLinuxId());
};

/** This computer's id as the license server knows it: the platform's own id, hashed. */
export const readDeviceId = async () =>
  createHash("sha256")
    .update(await readPlatformId())
    .digest("hex");
