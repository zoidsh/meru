import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const environmentLicenseKey = "MERU-ENVIRONMENT-0000-0000-0000";

const activatedLicenseKey = "MERU-ACTIVATED-0000-0000-0000-00";

let isDev = true;

let storedKey: string | null = null;

const configWrites: [string, unknown][] = [];

// Everything the module reaches for at import time wants an Electron app that
// does not exist here, and the licensing API would go over the network. Only the
// config store is real enough to answer, because the write is what is under
// test. `is.dev` is mocked although the module no longer reads it, so that a
// gate put back on it would fail the packaged case rather than pass unnoticed.
mock.module("@electron-toolkit/utils", () => ({
  is: {
    get dev() {
      return isDev;
    },
  },
}));

mock.module("electron", () => ({
  app: { quit: () => {} },
  dialog: { showMessageBox: async () => ({ response: 1 }) },
}));

mock.module("@/config", () => ({
  config: {
    get: () => storedKey,
    set: (key: string, value: unknown) => {
      configWrites.push([key, value]);

      storedKey = value as string | null;
    },
  },
}));

mock.module("@/lib/machine-id", () => ({
  getMachineId: async () => "device-id",
}));

mock.module("@/lib/relaunch", () => ({
  relaunchApp: () => {},
}));

mock.module("./lib/log", () => ({
  log: { error: () => {} },
}));

mock.module("./url", () => ({
  openExternalUrl: () => {},
}));

mock.module("./api-client", () => ({
  apiClient: { v2: { license: {} } },
  apiFallbackClient: { v2: { license: {} } },
}));

const { licenseKey } = await import("./license-key");

// `bun test` runs under `NODE_ENV=test`, so Bun loads `.env.test.local` rather
// than the development env file a development run takes the key from, and
// nothing settles the variable for a run. Every case sets or clears it.
const inheritedLicenseKey = process.env.MERU_LICENSE_KEY;

function setEnvironmentLicenseKey(value: string | undefined) {
  if (value === undefined) {
    delete process.env.MERU_LICENSE_KEY;
  } else {
    process.env.MERU_LICENSE_KEY = value;
  }
}

beforeEach(() => {
  isDev = true;
  storedKey = null;
  configWrites.length = 0;
});

afterEach(() => {
  setEnvironmentLicenseKey(inheritedLicenseKey);
});

describe("init", () => {
  test("stores the key from the environment", () => {
    setEnvironmentLicenseKey(environmentLicenseKey);

    licenseKey.init();

    expect(configWrites).toEqual([["licenseKey", environmentLicenseKey]]);
  });

  test("stores it in a packaged app too", () => {
    isDev = false;
    setEnvironmentLicenseKey(environmentLicenseKey);

    licenseKey.init();

    expect(configWrites).toEqual([["licenseKey", environmentLicenseKey]]);
  });

  test("replaces a key the profile already holds", () => {
    storedKey = activatedLicenseKey;
    setEnvironmentLicenseKey(environmentLicenseKey);

    licenseKey.init();

    expect(configWrites).toEqual([["licenseKey", environmentLicenseKey]]);
  });

  test("writes nothing when the stored key already matches", () => {
    storedKey = environmentLicenseKey;
    setEnvironmentLicenseKey(environmentLicenseKey);

    licenseKey.init();

    expect(configWrites).toEqual([]);
  });

  test("leaves the stored key alone when the variable is unset or empty", () => {
    storedKey = activatedLicenseKey;

    setEnvironmentLicenseKey(undefined);

    licenseKey.init();

    setEnvironmentLicenseKey("");

    licenseKey.init();

    expect(configWrites).toEqual([]);
    expect(storedKey).toBe(activatedLicenseKey);
  });
});
