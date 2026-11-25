import { describe, expect, it } from "vitest";

import {
  normalizeLinuxId,
  parseIoregOutput,
  parseRegOutput,
} from "#core/device-id.ts";

import { hashPlatformId } from "./device-id.ts";

// v3's own test fixtures and the digest it pins for them: the device id the
// license server already holds for that machine. A different digest would
// count every v3 device again against its license's limit.
const DIGEST =
  "b0a45058c4b94c71d047d1b1e532f5c9e605184ef4e11d8eb5ead40e5a3ca508";

const IOREG_OUTPUT = `+-o Root  <class IORegistryEntry, id 0x100000100, retain 36>
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

const REG_OUTPUT = [
  "",
  String.raw`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography`,
  "    MachineGuid    REG_SZ    ABCDEF12-3456-7890-ABCD-EF1234567890",
  "",
  "",
].join("\r\n");

describe(hashPlatformId, () => {
  it("gives v3's device id on macOS", () => {
    expect(hashPlatformId(parseIoregOutput(IOREG_OUTPUT))).toBe(DIGEST);
  });

  it("gives v3's device id on Windows", () => {
    expect(hashPlatformId(parseRegOutput(REG_OUTPUT))).toBe(DIGEST);
  });

  it("gives v3's device id on Linux", () => {
    expect(
      hashPlatformId(normalizeLinuxId("ABCDEF12-3456-7890-ABCD-EF1234567890"))
    ).toBe(DIGEST);
  });
});
