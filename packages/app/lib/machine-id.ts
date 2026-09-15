import * as childProcess from "node:child_process";
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { promisify } from "node:util";
import { platform } from "@electron-toolkit/utils";
import {
  hashMachineId,
  normalizeLinuxId,
  parseIoregOutput,
  parseRegOutput,
} from "@/lib/machine-id-parsers";
import { getRegExePath } from "@/lib/windows";

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
  if (!machineId) {
    machineId = readMachineId().then(hashMachineId);

    machineId.catch(() => {
      machineId = undefined;
    });
  }

  return machineId;
}
