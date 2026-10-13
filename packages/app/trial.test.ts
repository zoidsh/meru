import { afterEach, beforeEach, expect, mock, test } from "bun:test";

type TrialResponse =
  | { error: null; data: { expired: boolean; daysLeft: number } }
  | { error: Error; data: null };

let responses: TrialResponse[] = [];

let apiCalls = 0;

const configWrites: [string, unknown][] = [];

const dialogs: { window: unknown; message: string }[] = [];

const sent: unknown[] = [];

const mainWindow = { webContents: {} };

const licenseKey = { isValid: false };

mock.module("electron", () => ({
  dialog: {
    showMessageBox: async (...args: unknown[]) => {
      const options = args.at(-1) as { message: string };

      dialogs.push({ window: args.length > 1 ? args[0] : undefined, message: options.message });

      return { response: 1 };
    },
  },
}));

mock.module("is-online", () => ({ default: async () => true }));

mock.module("@/lib/machine-id", () => ({ getMachineId: async () => "device-id" }));

mock.module("@/lib/relaunch", () => ({ relaunchApp: () => {} }));

const trialEndpoint = {
  v2: {
    license: {
      trial: async () => {
        apiCalls++;

        return responses.shift();
      },
    },
  },
};

mock.module("./api-client", () => ({ apiClient: trialEndpoint, apiFallbackClient: trialEndpoint }));

mock.module("./config", () => ({
  config: {
    get: () => false,
    set: (key: string, value: unknown) => {
      configWrites.push([key, value]);
    },
  },
}));

mock.module("./ipc", () => ({
  ipc: {
    renderer: {
      send: (_webContents: unknown, _channel: string, payload: unknown) => {
        sent.push(payload);
      },
    },
  },
}));

mock.module("./lib/log", () => ({ log: { error: () => {} } }));

mock.module("./license-key", () => ({ licenseKey }));

mock.module("./main", () => ({ main: { window: mainWindow } }));

mock.module("./url", () => ({ openExternalUrl: () => {} }));

const { trial } = await import("./trial");

const originalSetInterval = globalThis.setInterval;

let tick: (() => void) | undefined;

const inheritedNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  responses = [];
  apiCalls = 0;
  configWrites.length = 0;
  dialogs.length = 0;
  sent.length = 0;
  licenseKey.isValid = false;
  trial.daysLeft = 0;
  trial.expired = false;
  tick = undefined;

  process.env.NODE_ENV = "production";

  globalThis.setInterval = ((callback: () => void) => {
    tick = callback;

    return 0;
  }) as unknown as typeof setInterval;
});

afterEach(() => {
  globalThis.setInterval = originalSetInterval;

  process.env.NODE_ENV = inheritedNodeEnv;
});

const ok = (daysLeft: number): TrialResponse => ({
  error: null,
  data: { expired: false, daysLeft },
});

const failure = (): TrialResponse => ({ error: new Error("offline"), data: null });

async function runTick() {
  tick?.();

  // The tick does not return its promise, so let it settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function launch(daysLeft: number) {
  responses.push(ok(daysLeft));

  expect(await trial.validate()).toBe(true);

  expect(tick).toBeDefined();
}

test("the periodic check asks the API and pushes the days left", async () => {
  await launch(10);

  responses.push(ok(9));

  await runTick();

  expect(apiCalls).toBe(2);
  expect(trial.daysLeft).toBe(9);
  expect(sent).toEqual([{ daysLeft: 9, expired: false }]);
  expect(dialogs).toEqual([]);
});

test("a periodic check that fails on both clients changes nothing and shows nothing", async () => {
  await launch(10);

  responses.push(failure(), failure());

  await runTick();

  expect(apiCalls).toBe(3);
  expect(trial.daysLeft).toBe(10);
  expect(sent).toEqual([]);
  expect(dialogs).toEqual([]);
  expect(configWrites).toEqual([]);
});

test("a periodic check that finds the trial over keeps Pro and says so", async () => {
  await launch(1);

  responses.push({ error: null, data: { expired: true, daysLeft: 0 } });

  await runTick();

  expect(licenseKey.isValid).toBe(true);
  expect(trial.expired).toBe(true);
  expect(configWrites).toEqual([["trial.expired", true]]);
  expect(sent).toEqual([{ daysLeft: 0, expired: true }]);
  expect(dialogs).toEqual([{ window: mainWindow, message: "Your Meru Pro trial has ended." }]);
});
