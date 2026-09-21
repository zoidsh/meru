import * as childProcess from "node:child_process";
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { promisify } from "node:util";
import { platform } from "@electron-toolkit/utils";
import { getRegExePath } from "@/lib/windows";
import { hashMachineId, normalizeLinuxId, parseIoregOutput, parseRegOutput } from "./parsers";

const execFile = promisify(childProcess.execFile);

const linuxMachineIdFiles = ["/var/lib/dbus/machine-id", "/etc/machine-id"];

async function readLinuxMachineId() {
  for (const filePath of linuxMachineIdFiles) {
    let contents: string;

    try {
      contents = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    if (contents) {
      const [line = ""] = contents.split("\n");

      return line;
    }
  }

  return hostname();
}

async function readMachineId() {
  if (platform.isMacOS) {
    const { stdout } = await execFile("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);

    return parseIoregOutput(stdout);
  }

  if (platform.isWindows) {
    const { stdout } = await execFile(getRegExePath(), [
      "QUERY",
      String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography`,
      "/v",
      "MachineGuid",
    ]);

    return parseRegOutput(stdout);
  }

  if (platform.isLinux) {
    return normalizeLinuxId(await readLinuxMachineId());
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

let machineId: Promise<string> | undefined;

export function getMachineId() {
  // Already a finished device id rather than a raw platform one, so it skips the
  // hash. Safe to read at runtime because a release build inlines an empty string
  // here, leaving nothing for a shipped app's environment to answer.
  if (process.env.MERU_BUILD_DEVICE_ID) {
    return Promise.resolve(process.env.MERU_BUILD_DEVICE_ID);
  }

  if (!machineId) {
    machineId = readMachineId().then(hashMachineId);

    machineId.catch(() => {
      machineId = undefined;
    });
  }

  return machineId;
}
