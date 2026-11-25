import { describe, expect, it } from "vitest";

import {
  normalizeLinuxId,
  parseIoregOutput,
  parseRegOutput,
} from "./device-id.ts";

describe(parseIoregOutput, () => {
  it("reads IOPlatformUUID, lowercased, as v3 does", () => {
    const output = [
      "+-o J274AP  <class IOPlatformExpertDevice>",
      '    "IOPlatformSerialNumber" = "C02ABC"',
      '    "IOPlatformUUID" = "0A1B2C3D-4E5F-6789-ABCD-EF0123456789"',
      '    "model" = <"Macmini9,1">',
    ].join("\n");

    expect(parseIoregOutput(output)).toBe(
      "0a1b2c3d-4e5f-6789-abcd-ef0123456789"
    );
  });

  it("throws on output with none", () => {
    expect(() => parseIoregOutput("nothing")).toThrow("IOPlatformUUID");
  });
});

describe(parseRegOutput, () => {
  it("reads MachineGuid, lowercased, as v3 does", () => {
    const output =
      "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    0A1B2C3D-4E5F-6789-ABCD-EF0123456789\r\n\r\n";

    expect(parseRegOutput(output)).toBe("0a1b2c3d-4e5f-6789-abcd-ef0123456789");
  });

  it("throws on output with none", () => {
    expect(() => parseRegOutput("nothing")).toThrow("REG_SZ");
  });
});

describe(normalizeLinuxId, () => {
  it("strips white space and lowercases", () => {
    expect(normalizeLinuxId(" 0A1B2C3D4E5F\r\n")).toBe("0a1b2c3d4e5f");
  });
});
