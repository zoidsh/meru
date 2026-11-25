import { generateKeyPairSync, sign } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withUnconfirmedKey } from "#core/entitlement-file.ts";
import type { EntitlementFile } from "#core/entitlement-file.ts";
import { DAY } from "#core/entitlement.ts";
import type { Entitlement } from "#core/entitlement.ts";
import type {
  EntitlementServer,
  ServerAnswer,
} from "#platform/entitlement-server.ts";

import { REFRESH_INTERVAL, createEntitlement } from "./entitlement.ts";

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

/** A server that answers each call with `answer`, recording what it was sent. */
const createFakeServer = () => {
  const requests: Request[] = [];
  let answer = (_request: Request): ServerAnswer => ({ error: "offline" });

  const handle =
    (call: keyof EntitlementServer) => (request: Record<string, unknown>) => {
      const sent = { call, ...request };

      requests.push(sent);

      return Promise.resolve(answer(sent));
    };

  return {
    requests,
    answerWith: (next: (request: Request) => ServerAnswer) => {
      answer = next;
    },
    server: {
      refresh: handle("refresh"),
      activate: handle("activate"),
      setDeviceLabel: handle("setDeviceLabel"),
    } satisfies EntitlementServer,
  };
};

const setup = (initial?: EntitlementFile) => {
  const fake = createFakeServer();
  const saved: EntitlementFile[] = [];
  const logs: string[] = [];
  const create = (file: EntitlementFile) =>
    createEntitlement({
      initial: file,
      save: (next) => {
        saved.push(next);

        return Promise.resolve();
      },
      server: fake.server,
      publicKey: keys.publicKey,
      deviceId: DEVICE,
      now: Date.now,
      timeZone: "UTC",
      log: (message) => logs.push(message),
    });

  return {
    ...fake,
    saved,
    logs,
    entitlement: create(initial ?? { version: 1 }),
    create,
  };
};

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
      hasLicenseKey: true,
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
      hasLicenseKey: true,
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
      now: Date.now,
      log: () => {},
    });

    expect(entitlement.snapshot().status).toBe("none");
    expect(entitlement.can("profiles")).toBeFalsy();
    entitlement.dispose();
  });
});
