import { describe, expect, test } from "bun:test";
import {
  hashMachineId,
  normalizeLinuxId,
  parseIoregOutput,
  parseRegOutput,
} from "./machine-id-parsers";

const machineGuid = "abcdef12-3456-7890-abcd-ef1234567890";

const machineGuidDigest = "b0a45058c4b94c71d047d1b1e532f5c9e605184ef4e11d8eb5ead40e5a3ca508";

const ioregOutput = `+-o Root  <class IORegistryEntry, id 0x100000100, retain 36>
  +-o MacBookPro18,3  <class IOPlatformExpertDevice, id 0x100000265, registered, matched, active, busy 0 (0 ms), retain 42>
    {
      "IOPolledInterface" = "AppleARMWatchdogTimerHibernateHandler is not serializable"
      "IOPlatformSerialNumber" = "C02ABCDEFGHI"
      "IOPlatformUUID" = "ABCDEF12-3456-7890-ABCD-EF1234567890"
      "IOBusyInterest" = "IOCommand is not serializable"
      "target-type" = <"Mac">
      "platform-name" = <"t6000">
    }

`;

const regOutput = [
  "",
  String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography`,
  "    MachineGuid    REG_SZ    ABCDEF12-3456-7890-ABCD-EF1234567890",
  "",
  "",
].join("\r\n");

describe("parseIoregOutput", () => {
  test("reads the lowercased IOPlatformUUID out of the property block", () => {
    expect(parseIoregOutput(ioregOutput)).toBe(machineGuid);
  });

  test("hashes to the device ID the licensing API knows", () => {
    expect(hashMachineId(parseIoregOutput(ioregOutput))).toBe(machineGuidDigest);
  });

  test("rejects output without the key", () => {
    expect(() => parseIoregOutput("+-o Root  <class IORegistryEntry>\n")).toThrow(
      "ioreg output contains no IOPlatformUUID",
    );
  });
});

describe("parseRegOutput", () => {
  test("reads the lowercased MachineGuid out of the registry query", () => {
    expect(parseRegOutput(regOutput)).toBe(machineGuid);
  });

  test("hashes to the device ID the licensing API knows", () => {
    expect(hashMachineId(parseRegOutput(regOutput))).toBe(machineGuidDigest);
  });

  test("rejects output without a value", () => {
    expect(() => parseRegOutput("ERROR: The system was unable to find the key.\r\n")).toThrow(
      "REG.exe output contains no REG_SZ value",
    );
  });
});

describe("normalizeLinuxId", () => {
  test("strips the trailing newline and lowercases the ID", () => {
    expect(normalizeLinuxId("ABCDEF1234567890ABCDEF1234567890\n")).toBe(
      "abcdef1234567890abcdef1234567890",
    );
  });

  test("strips carriage returns and inner whitespace from a hostname fallback", () => {
    expect(normalizeLinuxId("Tims MacBook\r\n")).toBe("timsmacbook");
  });

  test("hashes to the device ID the licensing API knows", () => {
    expect(hashMachineId(normalizeLinuxId("ABCDEF12-3456-7890-ABCD-EF1234567890\n"))).toBe(
      machineGuidDigest,
    );
  });
});
