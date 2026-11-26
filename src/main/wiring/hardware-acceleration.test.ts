import { describe, expect, it } from "vitest";

import { fakeTextFile } from "#platform/text-file.fake.ts";

import { wireHardwareAcceleration } from "./hardware-acceleration.ts";

const FILE = "/data/settings.json";

/** The wiring over the file, recording each call it makes of the app. */
const wire = (
  settingsFile: Parameters<typeof wireHardwareAcceleration>[0]["settingsFile"]
) => {
  const calls: string[] = [];
  const on = wireHardwareAcceleration({
    settingsFile,
    lifecycle: {
      disableHardwareAcceleration: () => {
        calls.push("disableHardwareAcceleration");
      },
    },
    platform: "darwin",
  });

  return { on, calls };
};

describe(wireHardwareAcceleration, () => {
  it("turns it off for the run when the file stores false", () => {
    const files = new Map([
      [FILE, JSON.stringify({ version: 1, hardwareAcceleration: false })],
    ]);

    expect(wire(fakeTextFile(FILE, files))).toStrictEqual({
      on: false,
      calls: ["disableHardwareAcceleration"],
    });
  });

  it("keeps it, calling nothing and throwing nothing, when the read throws", () => {
    const unreadable = {
      readSync: () => {
        throw new Error("EACCES: permission denied");
      },
    };

    expect(wire(unreadable)).toStrictEqual({ on: true, calls: [] });
  });
});
