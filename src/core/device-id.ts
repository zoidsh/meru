// Each step from the platform's output to the id must stay byte-identical to
// v3's, whose ids the license server already holds: a different one counts
// every device again against its license's limit.

/** The `IOPlatformUUID` of `ioreg -rd1 -c IOPlatformExpertDevice`. */
export const parseIoregOutput = (output: string) => {
  const [, afterKey] = output.split("IOPlatformUUID");

  if (afterKey === undefined) {
    throw new Error("ioreg output holds no IOPlatformUUID");
  }

  return (afterKey.split("\n")[0] ?? "")
    .replaceAll(/[=]|\s+|"/gu, "")
    .toLowerCase();
};

/** The `MachineGuid` value of `reg QUERY …\Cryptography /v MachineGuid`. */
export const parseRegOutput = (output: string) => {
  const [, afterType] = output.split("REG_SZ");

  if (afterType === undefined) {
    throw new Error("reg output holds no REG_SZ value");
  }

  return afterType.replaceAll(/\r+|\n+|\s+/gu, "").toLowerCase();
};

/** The first line of a machine-id file, or the host's name where none is read. */
export const normalizeLinuxId = (id: string) =>
  id.replaceAll(/\r+|\n+|\s+/gu, "").toLowerCase();
