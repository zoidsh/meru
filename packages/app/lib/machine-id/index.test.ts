import { afterEach, describe, expect, mock, test } from "bun:test";
import { hashMachineId, normalizeLinuxId } from "./parsers";

const linuxMachineId = "3f2b1c8a9d4e4f6b8a1c2d3e4f5a6b7c\n";

const platformDeviceId = hashMachineId(normalizeLinuxId(linuxMachineId));

const overrideDeviceId = "a1b2c3d4e5f6g7h8";

// The module picks its platform read off `@electron-toolkit/utils`, which
// reaches for an Electron app that does not exist here, and the read itself
// would otherwise be this machine's own `/etc/machine-id` or hostname.
mock.module("@electron-toolkit/utils", () => ({
  platform: { isLinux: true },
}));

mock.module("node:fs/promises", () => ({
  readFile: async () => linuxMachineId,
}));

const { getMachineId } = await import("./index");

// Nothing settles the variable for a test run: `bun test` runs under
// `NODE_ENV=test`, so Bun loads `.env.test.local` rather than the development
// env file a development run takes the id from. Every case sets or clears it.
const inheritedDeviceId = process.env.MERU_BUILD_DEVICE_ID;

function setDeviceId(deviceId: string | undefined) {
  if (deviceId === undefined) {
    delete process.env.MERU_BUILD_DEVICE_ID;
  } else {
    process.env.MERU_BUILD_DEVICE_ID = deviceId;
  }
}

afterEach(() => {
  setDeviceId(inheritedDeviceId);
});

describe("getMachineId", () => {
  test("returns the override verbatim", async () => {
    setDeviceId(overrideDeviceId);

    const deviceId = await getMachineId();

    expect(deviceId).toBe(overrideDeviceId);
    expect(deviceId).not.toBe(hashMachineId(overrideDeviceId));
  });

  test("reads the platform when the variable is unset", async () => {
    setDeviceId(undefined);

    expect(await getMachineId()).toBe(platformDeviceId);
  });

  test("reads the platform when the variable is empty", async () => {
    setDeviceId("");

    expect(await getMachineId()).toBe(platformDeviceId);
  });

  test("keeps caching the platform read across an override", async () => {
    setDeviceId(undefined);

    const cached = getMachineId();

    expect(getMachineId()).toBe(cached);

    setDeviceId(overrideDeviceId);

    expect(await getMachineId()).toBe(overrideDeviceId);

    setDeviceId(undefined);

    expect(getMachineId()).toBe(cached);
    expect(await getMachineId()).toBe(platformDeviceId);
  });
});
