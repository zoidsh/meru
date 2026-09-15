// Every step from the raw platform output down to the digest has to stay
// byte-identical to what `node-machine-id` produced: the digest is the device
// ID the licensing API registers, and a different one re-registers every device

import { createHash } from "node:crypto";

export function parseIoregOutput(output: string) {
  const afterKey = output.split("IOPlatformUUID")[1];

  if (afterKey === undefined) {
    throw new Error("ioreg output contains no IOPlatformUUID");
  }

  const [line = ""] = afterKey.split("\n");

  return line.replace(/=|\s+|"/gi, "").toLowerCase();
}

export function parseRegOutput(output: string) {
  const afterType = output.split("REG_SZ")[1];

  if (afterType === undefined) {
    throw new Error("REG.exe output contains no REG_SZ value");
  }

  return afterType.replace(/\r+|\n+|\s+/gi, "").toLowerCase();
}

export function normalizeLinuxId(id: string) {
  return id.replace(/\r+|\n+|\s+/gi, "").toLowerCase();
}

export function hashMachineId(id: string) {
  return createHash("sha256").update(id).digest("hex");
}
