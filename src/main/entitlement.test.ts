import { generateKeyPairSync, sign } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withUnconfirmedKey } from "#core/entitlement-file.ts";
import type { EntitlementFile } from "#core/entitlement-file.ts";
import { DAY } from "#core/entitlement.ts";
import type { Entitlement } from "#core/entitlement.ts";
import { recordInto, silentLog } from "#core/log.fake.ts";
import type {
  EntitlementServer,
  ServerAnswer,
} from "#platform/entitlement-server.ts";

import {
  REFRESH_INTERVAL,
  createEntitlement,
  saveEntitlementFile,
} from "./entitlement.ts";
import { hasSettled, heldTextFile } from "./held-file.fake.ts";

// Midday, so a 14-day trial begun now has 14 calendar days to its last.
const START = Date.UTC(2026, 10, 1, 12);
const DEVICE = "device";
const keys = generateKeyPairSync("ed25519");
const strangers = generateKeyPairSync("ed25519");

const signToken = (
  fields: Partial<Entitlement>,
  privateKey = keys.privateKey
) => {
  const issuedAt = Date.now();
  const bytes = Buffer.from(
    JSON.stringify({
      v: 1,
      tier: "pro",
      deviceId: DEVICE,
      issuedAt,
      expiresAt: issuedAt + 14 * DAY,
      ...fields,
    })
  );

  return `${bytes.toString("base64url")}.${sign(null, bytes, privateKey).toString("base64url")}`;
};

type Request = { call: keyof EntitlementServer } & Record<string, unknown>;

/**
 * A server that answers each call with `answer`, recording what it was sent;
 * while holding, it answers none until the test resolves each in `held`.
 */
const createFakeServer = () => {
  const requests: Request[] = [];
  const held: ((answer: ServerAnswer) => void)[] = [];
  let holding = false;
  let answer = (_request: Request): ServerAnswer | Promise<ServerAnswer> => ({
    error: "offline",
  });

  const handle =
    (call: keyof EntitlementServer) => (request: Record<string, unknown>) => {
      const sent = { call, ...request };

      requests.push(sent);

      if (holding) {
        const { promise, resolve } = Promise.withResolvers<ServerAnswer>();

        held.push(resolve);

        return promise;
      }

      return Promise.resolve(answer(sent));
    };

  return {
    requests,
    held,
    hold: () => {
      holding = true;
    },
    answerWith: (
      next: (request: Request) => ServerAnswer | Promise<ServerAnswer>
    ) => {
      answer = next;
    },
    server: {
      refresh: handle("refresh"),
      activate: handle("activate"),
      setDeviceLabel: handle("setDeviceLabel"),
    } satisfies EntitlementServer,
  };
};

const setup = (initial?: EntitlementFile, deviceId = DEVICE) => {
  const fake = createFakeServer();
  const saved: EntitlementFile[] = [];
  const logs: string[] = [];
  const copied: string[] = [];
  const disk = { full: false };
  const create = (file: EntitlementFile) =>
    createEntitlement({
      initial: file,
      save: (next) => {
        if (disk.full) {
          return Promise.reject(new Error("ENOSPC: no space left on device"));
        }

        saved.push(next);

        return Promise.resolve();
      },
      server: fake.server,
      publicKey: keys.publicKey,
      deviceId,
      clipboard: {
        writeText: (text) => {
          copied.push(text);

          return Promise.resolve();
        },
      },
      now: Date.now,
      timeZone: "UTC",
      log: recordInto(logs),
    });

  return {
    ...fake,
    saved,
    logs,
    copied,
    disk,
    entitlement: create(initial ?? { version: 1 }),
    create,
  };
};

const setupLicensed = () =>
  setup({
    version: 1,
    token: signToken({ deviceLabel: "Studio" }),
    licenseKey: "MERU-OLD-0000",
  });

describe(createEntitlement, () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads a stored token at launch with no network", () => {
    const { entitlement, requests } = setup({
      version: 1,
      token: signToken({ tier: "pro", licensee: "Ada" }),
      licenseKey: "MERU-KEY-0001",
    });

    expect(entitlement.can("profiles")).toBeTruthy();
    expect(entitlement.snapshot()).toMatchObject({
      status: "licensed",
      tier: "pro",
      licensee: "Ada",
      licenseKey: "••••-•••-••••",
      lastConfirmed: START,
    });
    expect(requests).toStrictEqual([]);
  });

  it("trusts no token another key signed, nor another device's", () => {
    const forged = setup({
      version: 1,
      token: signToken({}, strangers.privateKey),
    });
    const copied = setup({
      version: 1,
      token: signToken({ deviceId: "another" }),
    });

    expect(forged.entitlement.snapshot().status).toBe("none");
    expect(copied.entitlement.snapshot().status).toBe("none");
    expect(forged.entitlement.can("profiles")).toBeFalsy();
  });

  it("starts a trial with the device's id alone, at launch, and stores the token", async () => {
    const { entitlement, answerWith, requests, saved } = setup();
    let changes = 0;

    entitlement.onChange(() => {
      changes += 1;
    });
    answerWith(() => ({
      token: signToken({ tier: "trial", trialEndsAt: START + 14 * DAY }),
    }));
    await entitlement.start();

    expect(requests).toStrictEqual([{ call: "refresh", deviceId: DEVICE }]);
    expect(entitlement.snapshot()).toMatchObject({
      status: "trial",
      tier: "trial",
      trialDaysLeft: 14,
    });
    expect(entitlement.can("splitView")).toBeTruthy();
    expect(saved).toHaveLength(1);
    expect(changes).toBe(1);
    entitlement.dispose();
  });

  it("refreshes every three hours, keeping the token when a refresh fails", async () => {
    const stored = signToken({});
    const { entitlement, requests, saved, logs } = setup({
      version: 1,
      token: stored,
      licenseKey: "MERU-KEY-0001",
    });

    await entitlement.start();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL * 2);

    expect(requests).toStrictEqual(
      Array.from({ length: 3 }, () => ({
        call: "refresh",
        deviceId: DEVICE,
        licenseKey: "MERU-KEY-0001",
      }))
    );
    expect(saved).toStrictEqual([]);
    expect(entitlement.snapshot().status).toBe("licensed");
    expect(logs).toHaveLength(3);
    entitlement.dispose();
  });

  it("announces the trial's days as they pass, and keeps Pro to the next launch once it ends", async () => {
    const token = signToken({ tier: "trial", trialEndsAt: START + 2 * DAY });
    const { entitlement, create } = setup({ version: 1, token });
    const days: (number | null)[] = [];

    entitlement.onChange(() => days.push(entitlement.snapshot().trialDaysLeft));
    await vi.advanceTimersByTimeAsync(2 * DAY);

    expect(days).toStrictEqual([1, 0, null]);
    expect(entitlement.snapshot()).toMatchObject({
      status: "trialEnded",
      tier: "trial",
      downgradePending: true,
    });
    expect(entitlement.can("profiles")).toBeTruthy();
    expect(create({ version: 1, token }).can("profiles")).toBeFalsy();
    entitlement.dispose();
  });

  it("takes a refund that arrives while running at the next launch", async () => {
    const { entitlement, answerWith, saved, create } = setup({
      version: 1,
      token: signToken({}),
      licenseKey: "MERU-KEY-0001",
    });

    answerWith(() => ({
      token: signToken({ tier: "free", reason: "licenseRefused" }),
    }));
    await entitlement.start();

    expect(entitlement.snapshot()).toMatchObject({
      status: "refused",
      tier: "pro",
      downgradePending: true,
    });
    expect(entitlement.can("unifiedInbox")).toBeTruthy();

    const next = create(saved.at(-1) ?? { version: 1 });

    expect(next.snapshot()).toMatchObject({ status: "refused", tier: "free" });
    expect(next.can("unifiedInbox")).toBeFalsy();
    entitlement.dispose();
  });

  it("is unconfirmed after 14 days with no contact, and back at once when a retry lands", async () => {
    const token = signToken({});

    vi.setSystemTime(START + 14 * DAY);

    const { entitlement, answerWith } = setup({
      version: 1,
      token,
      licenseKey: "MERU-KEY-0001",
    });

    expect(entitlement.snapshot()).toMatchObject({
      status: "unconfirmed",
      unconfirmedReason: "offline",
      tier: "free",
    });
    expect(entitlement.can("profiles")).toBeFalsy();

    answerWith(() => ({ token: signToken({}) }));
    await entitlement.retry();

    expect(entitlement.snapshot()).toMatchObject({
      status: "licensed",
      tier: "pro",
      unconfirmedReason: null,
    });
    expect(entitlement.can("profiles")).toBeTruthy();
    entitlement.dispose();
  });

  it("is unconfirmed for the clock when it reads well before the token's issue, and recovers on a refresh", async () => {
    const issuedAt = START + 5 * DAY;
    const { entitlement, answerWith } = setup({
      version: 1,
      token: signToken({ issuedAt, expiresAt: issuedAt + 14 * DAY }),
    });

    expect(entitlement.snapshot()).toMatchObject({
      status: "unconfirmed",
      unconfirmedReason: "clock",
      tier: "free",
    });

    answerWith(() => ({ token: signToken({}) }));
    await entitlement.start();

    expect(entitlement.snapshot()).toMatchObject({
      status: "licensed",
      tier: "pro",
      unconfirmedReason: null,
    });
    entitlement.dispose();
  });

  it("holds an imported key as Pro until the server confirms it", async () => {
    const { entitlement, answerWith, requests } = setup(
      withUnconfirmedKey({ version: 1 }, "MERU-KEY-0001", START)
    );

    expect(entitlement.snapshot()).toMatchObject({
      status: "provisional",
      tier: "pro",
    });
    expect(entitlement.can("profiles")).toBeTruthy();

    answerWith(() => ({ token: signToken({ licensee: "Ada" }) }));
    await entitlement.start();

    expect(requests).toStrictEqual([
      { call: "refresh", deviceId: DEVICE, licenseKey: "MERU-KEY-0001" },
    ]);
    expect(entitlement.snapshot()).toMatchObject({
      status: "licensed",
      licensee: "Ada",
    });
    entitlement.dispose();
  });

  it("refuses a key out of shape without asking the server", async () => {
    const { entitlement, requests } = setup();

    await expect(entitlement.activate("  not a key ")).resolves.toStrictEqual({
      ok: false,
      error: "malformed",
      message: "This isn't a valid license key. Check it and try again.",
    });
    expect(requests).toStrictEqual([]);
    entitlement.dispose();
  });

  it("activates a key under the device's name, storing it only once the server agrees", async () => {
    const { entitlement, answerWith, requests, saved } = setup();

    answerWith(() => ({ error: "deviceLimit" }));

    await expect(entitlement.activate("MERU-USED-0001")).resolves.toMatchObject(
      {
        ok: false,
        error: "deviceLimit",
        message: "This key is already in use on as many devices as it allows.",
      }
    );

    answerWith(() => ({ token: signToken({ deviceLabel: "Device 4F2A" }) }));

    await expect(
      entitlement.activate(" MERU-GOOD-0001 ")
    ).resolves.toStrictEqual({
      ok: true,
    });
    expect(requests).toStrictEqual([
      { call: "activate", deviceId: DEVICE, licenseKey: "MERU-USED-0001" },
      { call: "activate", deviceId: DEVICE, licenseKey: "MERU-GOOD-0001" },
    ]);
    expect(saved).toStrictEqual([
      expect.objectContaining({ licenseKey: "MERU-GOOD-0001" }),
    ]);
    expect(entitlement.snapshot()).toMatchObject({
      status: "licensed",
      tier: "pro",
      deviceName: "Device 4F2A",
    });
    entitlement.dispose();
  });

  it("sends nothing at activation but the key and the device's id", async () => {
    const { entitlement, answerWith, requests } = setup();

    answerWith(() => ({ token: signToken({}) }));
    await entitlement.activate("MERU-GOOD-0001");

    expect(requests).toStrictEqual([
      { call: "activate", deviceId: DEVICE, licenseKey: "MERU-GOOD-0001" },
    ]);
    entitlement.dispose();
  });

  it("keeps the key it had when changing to one the server refuses", async () => {
    const { entitlement, answerWith, saved } = setup({
      version: 1,
      token: signToken({}),
      licenseKey: "MERU-KEY-0001",
    });

    answerWith(() => ({ error: "invalidKey" }));

    await expect(entitlement.activate("MERU-0000-0002")).resolves.toMatchObject(
      {
        ok: false,
        error: "invalidKey",
      }
    );
    expect(saved).toStrictEqual([]);
    expect(entitlement.snapshot()).toMatchObject({
      status: "licensed",
      licenseKey: "••••-•••-••••",
    });
    entitlement.dispose();
  });

  it("refuses a token the server signs with another key", async () => {
    const { entitlement, answerWith, saved } = setup();

    answerWith(() => ({ token: signToken({}, strangers.privateKey) }));

    await expect(entitlement.activate("MERU-GOOD-0001")).resolves.toMatchObject(
      {
        ok: false,
        error: "offline",
      }
    );
    expect(saved).toStrictEqual([]);
    entitlement.dispose();
  });

  it("renames the device on its license", async () => {
    const { entitlement, answerWith, requests } = setup({
      version: 1,
      token: signToken({ deviceLabel: "Studio" }),
      licenseKey: "MERU-KEY-0001",
    });

    answerWith(() => ({ token: signToken({ deviceLabel: "Office Mac" }) }));

    await expect(
      entitlement.setDeviceName("  Office Mac ")
    ).resolves.toStrictEqual({
      ok: true,
    });
    expect(requests).toStrictEqual([
      {
        call: "setDeviceLabel",
        deviceId: DEVICE,
        licenseKey: "MERU-KEY-0001",
        deviceLabel: "Office Mac",
      },
    ]);
    expect(entitlement.snapshot().deviceName).toBe("Office Mac");
    entitlement.dispose();
  });

  it("grants nothing in a build that trusts no key", () => {
    const fake = createFakeServer();
    const entitlement = createEntitlement({
      initial: { version: 1, token: signToken({}) },
      save: () => Promise.resolve(),
      server: fake.server,
      publicKey: undefined,
      deviceId: DEVICE,
      clipboard: { writeText: () => Promise.resolve() },
      now: Date.now,
      log: silentLog,
    });

    expect(entitlement.snapshot().status).toBe("none");
    expect(entitlement.can("profiles")).toBeFalsy();
    entitlement.dispose();
  });
});

describe("the entitlement's answers out of order, and its edges", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps an activation that lands while a refresh sent before it is still out", async () => {
    const ended = signToken({ tier: "free", reason: "trialEnded" });
    const { entitlement, hold, held, saved } = setup({
      version: 1,
      token: ended,
    });

    hold();

    const launch = entitlement.start();
    const activation = entitlement.activate("MERU-GOOD-0001");

    await vi.waitFor(() => {
      expect(held).toHaveLength(2);
    });
    held[1]?.({ token: signToken({ deviceLabel: "Device 4F2A" }) });
    await activation;
    held[0]?.({ token: ended });
    await launch;

    expect(saved).toHaveLength(1);
    expect(saved.at(-1)).toMatchObject({ licenseKey: "MERU-GOOD-0001" });
    expect(entitlement.snapshot()).toMatchObject({
      status: "licensed",
      tier: "pro",
      downgradePending: false,
    });
    entitlement.dispose();
  });

  it("keeps the later of two refreshes whichever lands last", async () => {
    const { entitlement, hold, held, saved } = setup();
    const later = signToken({ tier: "trial", trialEndsAt: START + 5 * DAY });

    hold();

    const first = entitlement.retry();
    const second = entitlement.retry();

    await vi.waitFor(() => {
      expect(held).toHaveLength(2);
    });
    held[1]?.({ token: later });
    await second;
    held[0]?.({ token: signToken({ tier: "free", reason: "trialEnded" }) });
    await first;

    expect(saved).toStrictEqual([expect.objectContaining({ token: later })]);
    expect(entitlement.snapshot().status).toBe("trial");
    entitlement.dispose();
  });

  it("never asks the server without a device id, and says why", async () => {
    const { entitlement, requests, answerWith } = setup(
      { version: 1, licenseKey: "MERU-KEY-0001", token: signToken({}) },
      ""
    );

    answerWith(() => ({ token: signToken({}) }));
    await entitlement.start();
    await entitlement.retry();

    await expect(entitlement.activate("MERU-GOOD-0001")).resolves.toStrictEqual(
      {
        ok: false,
        error: "noDeviceId",
        message:
          "Meru couldn't identify this computer, so it can't check your license. Restart Meru and try again.",
      }
    );
    await expect(entitlement.setDeviceName("Studio")).resolves.toMatchObject({
      ok: false,
      error: "noDeviceId",
    });
    expect(requests).toStrictEqual([]);
    entitlement.dispose();
  });

  it("reads a license unconfirmed after a failed refresh once 14 days have gone by unseen", async () => {
    const { entitlement } = setup({
      version: 1,
      token: signToken({}),
      licenseKey: "MERU-KEY-0001",
    });

    expect(entitlement.snapshot().status).toBe("licensed");

    // As after a sleep: the clock moves on and no timer has fired.
    vi.setSystemTime(START + 15 * DAY);
    await entitlement.retry();

    expect(entitlement.snapshot()).toMatchObject({
      status: "unconfirmed",
      unconfirmedReason: "offline",
    });
    entitlement.dispose();
  });

  it("saves nothing and sets no timer for an answer that lands after quitting", async () => {
    const { entitlement, hold, held, saved } = setup();

    hold();

    const launch = entitlement.start();

    await vi.waitFor(() => {
      expect(held).toHaveLength(1);
    });
    entitlement.dispose();
    held[0]?.({
      token: signToken({ tier: "trial", trialEndsAt: START + 5 * DAY }),
    });
    await launch;

    expect(saved).toStrictEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends an empty name to give the device back the server's, and refuses a name with no license", async () => {
    const licensed = setup({
      version: 1,
      token: signToken({ deviceLabel: "Studio" }),
      licenseKey: "MERU-KEY-0001",
    });

    licensed.answerWith(() => ({
      token: signToken({ deviceLabel: "Device 4F2A" }),
    }));

    await expect(
      licensed.entitlement.setDeviceName("   ")
    ).resolves.toStrictEqual({ ok: true });
    expect(licensed.requests).toStrictEqual([
      {
        call: "setDeviceLabel",
        deviceId: DEVICE,
        licenseKey: "MERU-KEY-0001",
        deviceLabel: "",
      },
    ]);

    const free = setup();

    await expect(
      free.entitlement.setDeviceName("Studio")
    ).resolves.toStrictEqual({
      ok: false,
      error: "noLicense",
      message: "",
    });
    expect(free.requests).toStrictEqual([]);
    licensed.entitlement.dispose();
    free.entitlement.dispose();
  });
});

describe("the entitlement's license calls landing out of order", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops a rename for the key an activation since replaced", async () => {
    const { entitlement, hold, held, saved } = setupLicensed();
    const activated = signToken({ deviceLabel: "Device 4F2A" });

    hold();

    const activation = entitlement.activate("MERU-NEW-0001");
    const rename = entitlement.setDeviceName("Office");

    await vi.waitFor(() => {
      expect(held).toHaveLength(2);
    });
    held[0]?.({ token: activated });
    await activation;
    held[1]?.({ token: signToken({ deviceLabel: "Office" }) });

    await expect(rename).resolves.toStrictEqual({ ok: true });
    expect(saved).toStrictEqual([
      expect.objectContaining({
        licenseKey: "MERU-NEW-0001",
        token: activated,
      }),
    ]);
    expect(entitlement.snapshot().deviceName).toBe("Device 4F2A");
    entitlement.dispose();
  });

  it("keeps an activation that lands after a rename sent after it", async () => {
    const { entitlement, hold, held, saved } = setupLicensed();
    const activated = signToken({ deviceLabel: "Device 4F2A" });

    hold();

    const activation = entitlement.activate("MERU-NEW-0001");
    const rename = entitlement.setDeviceName("Office");

    await vi.waitFor(() => {
      expect(held).toHaveLength(2);
    });
    held[1]?.({ token: signToken({ deviceLabel: "Office" }) });
    await rename;
    held[0]?.({ token: activated });

    await expect(activation).resolves.toStrictEqual({ ok: true });
    expect(saved.at(-1)).toStrictEqual(
      expect.objectContaining({ licenseKey: "MERU-NEW-0001", token: activated })
    );
    expect(entitlement.snapshot().licenseKey).toBe("••••-•••-••••");
    entitlement.dispose();
  });

  it("keeps the later of two activations, and the earlier still reads as accepted", async () => {
    const { entitlement, hold, held, saved } = setupLicensed();
    const second = signToken({ deviceLabel: "Device 4F2A" });

    hold();

    const first = entitlement.activate("MERU-ONE-0001");
    const later = entitlement.activate("MERU-TWO-0002");

    await vi.waitFor(() => {
      expect(held).toHaveLength(2);
    });
    held[1]?.({ token: second });
    await later;
    held[0]?.({ token: signToken({ deviceLabel: "Device 77C1" }) });

    await expect(first).resolves.toStrictEqual({ ok: true });
    expect(saved).toStrictEqual([
      expect.objectContaining({ licenseKey: "MERU-TWO-0002", token: second }),
    ]);
    entitlement.dispose();
  });

  it("reads a server call that rejects as no answer, for every call", async () => {
    const { entitlement, answerWith, saved, logs } = setupLicensed();

    answerWith(() => Promise.reject(new Error("socket hang up")));

    await entitlement.retry();
    await expect(entitlement.activate("MERU-NEW-0001")).resolves.toMatchObject({
      ok: false,
      error: "offline",
    });
    await expect(entitlement.setDeviceName("Office")).resolves.toMatchObject({
      ok: false,
      error: "offline",
    });
    expect(saved).toStrictEqual([]);
    expect(logs).toContain('license-server-call-failed error="socket hang up"');
    entitlement.dispose();
  });
});

describe("the entitlement on waking from sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an expiry passed asleep at once, and asks the server only after three hours", async () => {
    const { entitlement, requests } = setup({
      version: 1,
      token: signToken({}),
      licenseKey: "MERU-KEY-0001",
    });
    let changes = 0;

    entitlement.onChange(() => {
      changes += 1;
    });
    await entitlement.start();
    expect(requests).toHaveLength(1);

    // Asleep for an hour: no timer fired, nothing to ask yet.
    vi.setSystemTime(START + 60 * 60 * 1000);
    await entitlement.resume();
    expect(requests).toHaveLength(1);

    // Asleep past the token's expiry.
    vi.setSystemTime(START + 15 * DAY);
    await entitlement.resume();

    expect(requests).toHaveLength(2);
    expect(changes).toBe(1);
    expect(entitlement.snapshot()).toMatchObject({
      status: "unconfirmed",
      unconfirmedReason: "offline",
    });
    entitlement.dispose();
  });
});

describe("the entitlement's wake beside other work", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends no second refresh while one is still out", async () => {
    const { entitlement, hold, held, requests } = setup();

    hold();

    const launch = entitlement.start();

    await vi.waitFor(() => {
      expect(held).toHaveLength(1);
    });
    vi.setSystemTime(START + REFRESH_INTERVAL + 1);
    await entitlement.resume();

    expect(requests).toHaveLength(1);
    held[0]?.({ error: "offline" });
    await launch;
    entitlement.dispose();
  });

  it("does nothing once disposed", async () => {
    const { entitlement, requests } = setup({
      version: 1,
      token: signToken({}),
      licenseKey: "MERU-KEY-0001",
    });
    let changes = 0;

    entitlement.onChange(() => {
      changes += 1;
    });
    entitlement.dispose();
    vi.setSystemTime(START + 15 * DAY);
    await entitlement.resume();

    expect(requests).toStrictEqual([]);
    expect(changes).toBe(0);
    expect(entitlement.snapshot().status).toBe("licensed");
  });

  it("asks nothing without a device id, and says so once rather than on every wake", async () => {
    const { entitlement, requests, logs } = setup(undefined, "");

    await entitlement.start();
    for (const hours of [4, 8, 12]) {
      vi.setSystemTime(START + hours * 60 * 60 * 1000);
      // oxlint-disable-next-line no-await-in-loop -- one wake after another
      await entitlement.resume();
    }

    expect(requests).toStrictEqual([]);
    expect(
      logs.filter((line) => line.includes("reason=no-device-id"))
    ).toHaveLength(1);
    entitlement.dispose();
  });
});

describe("the license key on the clipboard", () => {
  it("copies the whole key from main, and nothing with no license", async () => {
    const withKey = setup({
      version: 1,
      token: signToken({}),
      licenseKey: "MERU-AAAA-BBBB-CCCC-DDDD-EEEE",
    });

    await expect(withKey.entitlement.copyLicenseKey()).resolves.toStrictEqual({
      ok: true,
    });
    expect(withKey.copied).toStrictEqual(["MERU-AAAA-BBBB-CCCC-DDDD-EEEE"]);
    expect(withKey.entitlement.snapshot().licenseKey).toBe(
      "MERU-••••-••••-••••-••••-EEEE"
    );

    const none = setup();

    await expect(none.entitlement.copyLicenseKey()).resolves.toMatchObject({
      ok: false,
      error: "noLicense",
    });
    expect(none.copied).toStrictEqual([]);
    withKey.entitlement.dispose();
    none.entitlement.dispose();
  });
});

describe("the choice after a trial ends", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is asked until the person continues free, and again after a later trial or license lapses", async () => {
    const ended = signToken({ tier: "free", reason: "trialEnded" });
    const { entitlement, answerWith, saved, create } = setup({
      version: 1,
      token: ended,
    });

    expect(entitlement.snapshot().trialChoicePending).toBeTruthy();

    await entitlement.continueFree();

    expect(entitlement.snapshot()).toMatchObject({
      status: "trialEnded",
      trialChoicePending: false,
    });
    expect(saved.at(-1)).toMatchObject({ continuedFreeAt: START });

    answerWith(() => ({ token: signToken({}) }));
    await entitlement.activate("MERU-GOOD-0001");

    const lapsed = create({
      ...saved.at(-1),
      version: 1,
      token: ended,
    });

    expect(saved.at(-1)).not.toHaveProperty("continuedFreeAt");
    expect(lapsed.snapshot().trialChoicePending).toBeTruthy();
    entitlement.dispose();
    lapsed.dispose();
  });

  it("records nothing where no trial ended", async () => {
    const { entitlement, saved } = setup({
      version: 1,
      token: signToken({}),
      licenseKey: "MERU-KEY-0001",
    });

    await entitlement.continueFree();

    expect(saved).toStrictEqual([]);
    entitlement.dispose();
  });
});

describe("the entitlement when its file cannot be written", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const NOT_SAVED = {
    ok: false,
    error: "notSaved",
    message:
      "Meru couldn't save your license. Check that your disk isn't full, then try again.",
  };
  const LOGGED =
    'entitlement-save-failed error="ENOSPC: no space left on device"';

  it("answers an activation it could not save as not saved, and keeps the key before it", async () => {
    const { entitlement, answerWith, disk, logs } = setupLicensed();

    answerWith(() => ({ token: signToken({ deviceLabel: "Device 4F2A" }) }));
    disk.full = true;

    await expect(entitlement.activate("MERU-NEW-0001")).resolves.toStrictEqual(
      NOT_SAVED
    );
    expect(entitlement.snapshot()).toMatchObject({
      deviceName: "Studio",
      licenseKey: "••••-•••-••••",
    });
    expect(logs).toContain(LOGGED);
    entitlement.dispose();
  });

  it("answers a rename it could not save as not saved, the old name kept", async () => {
    const { entitlement, answerWith, disk, logs } = setupLicensed();

    answerWith(() => ({ token: signToken({ deviceLabel: "Office" }) }));
    disk.full = true;

    await expect(entitlement.setDeviceName("Office")).resolves.toStrictEqual(
      NOT_SAVED
    );
    expect(entitlement.snapshot().deviceName).toBe("Studio");
    expect(logs).toContain(LOGGED);
    entitlement.dispose();
  });

  it("answers the choice of the free version it could not save as not saved, and asks again", async () => {
    const { entitlement, disk, logs } = setup({
      version: 1,
      token: signToken({ tier: "free", reason: "trialEnded" }),
    });

    disk.full = true;

    await expect(entitlement.continueFree()).resolves.toStrictEqual(NOT_SAVED);
    expect(entitlement.snapshot().trialChoicePending).toBeTruthy();
    expect(logs).toContain(LOGGED);
    entitlement.dispose();
  });

  it("keeps a refresh it could not save out of the state, and takes the next one", async () => {
    const { entitlement, answerWith, disk, saved, logs } = setup();
    const trial = signToken({ tier: "trial", trialEndsAt: START + 5 * DAY });
    const before = entitlement.snapshot();

    answerWith(() => ({ token: trial }));
    disk.full = true;
    await entitlement.retry();

    expect(entitlement.snapshot()).toStrictEqual(before);
    expect(saved).toStrictEqual([]);
    expect(logs).toContain(LOGGED);

    disk.full = false;
    await entitlement.retry();

    expect(saved).toStrictEqual([expect.objectContaining({ token: trial })]);
    expect(entitlement.snapshot().status).toBe("trial");
    entitlement.dispose();
  });
});

describe("a quit's wait for the entitlement", () => {
  it("settles only once an activation being written has landed, though the entitlement is disposed first", async () => {
    const held = heldTextFile("/data/Meru Dev/entitlement.json");
    const fake = createFakeServer();
    const entitlement = createEntitlement({
      initial: { version: 1 },
      save: (next) => saveEntitlementFile(held.file, next),
      server: fake.server,
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      clipboard: { writeText: () => Promise.resolve() },
      now: Date.now,
      log: silentLog,
    });
    fake.answerWith(() => ({ token: signToken({}) }));

    const activation = entitlement.activate("MERU-KEY-0001");

    await vi.waitFor(() => {
      expect(held.inFlight()).toBe(1);
    });
    entitlement.dispose();

    const settled = entitlement.settled();

    await expect(hasSettled(settled)).resolves.toBeFalsy();

    held.land();

    await expect(activation).resolves.toStrictEqual({ ok: true });
    await expect(hasSettled(settled)).resolves.toBeTruthy();
    expect(JSON.parse(held.read() ?? "")).toMatchObject({
      licenseKey: "MERU-KEY-0001",
    });
  });

  it("does not wait for a call to the server still unanswered", async () => {
    const { entitlement, hold, held } = setup();

    hold();

    const activation = entitlement.activate("MERU-KEY-0001");

    await vi.waitFor(() => {
      expect(held).toHaveLength(1);
    });
    entitlement.dispose();

    await expect(entitlement.settled()).resolves.toBeUndefined();

    held[0]?.({ token: signToken({}) });

    await expect(activation).resolves.toMatchObject({ ok: false });
  });
});
