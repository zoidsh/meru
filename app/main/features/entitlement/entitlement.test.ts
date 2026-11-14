import { describe, expect, it } from "vitest";

import type { Claims } from "../../../core/entitlement/token.ts";
import { AppEvents } from "../../../core/events.ts";
import type { AppEventMap } from "../../../core/events.ts";
import { err, ok } from "../../../core/result.ts";
import { wireName } from "../../../shared/channels/define.ts";
import { entitlement as channels } from "../../../shared/channels/entitlement.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeEntitlementApi } from "../../../test/fakes/entitlement-api.ts";
import type { Scripted } from "../../../test/fakes/entitlement-api.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { FakeLog, strictLog } from "../../../test/fakes/log.ts";
import { FakeOnline } from "../../../test/fakes/online.ts";
import { FakePower } from "../../../test/fakes/power.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { ENTITLEMENT_FILE, Entitlement } from "./index.ts";
import type { EntitlementState } from "./index.ts";

const DEVICE = "device-1";
const KID = "test-1";
const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const PAGE = 7;

const pair = await crypto.subtle.generateKey("Ed25519", false, [
  "sign",
  "verify",
]);
if (!("privateKey" in pair)) {
  throw new Error("Ed25519 gave one key, not a pair");
}

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/** A token signed by the test key, issued at `NOW` and valid for an hour unless the overrides say otherwise. */
const mint = async (overrides: Partial<Claims> = {}) => {
  const claims: Claims = {
    deviceLimit: 3,
    exp: (NOW + HOUR) / 1000,
    iat: NOW / 1000,
    plan: "pro",
    status: "active",
    sub: DEVICE,
    ttl: 3600,
    ...overrides,
  };
  const input = `${encode({ alg: "EdDSA", kid: KID })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    "Ed25519",
    pair.privateKey,
    Buffer.from(input)
  );
  return `${input}.${Buffer.from(signature).toString("base64url")}`;
};

const issued =
  (overrides: Partial<Claims> = {}): Scripted =>
  async () =>
    ok({ token: await mint(overrides) });

const stateFile = (state: Partial<EntitlementState>) =>
  JSON.stringify({
    data: {
      deviceId: DEVICE,
      lastAnswer: null,
      licenseKey: null,
      rejected: null,
      token: null,
      ...state,
    },
    version: 1,
  });

const setup = async ({
  state,
  online = true,
  answers = [],
}: {
  state?: Partial<EntitlementState>;
  online?: boolean;
  answers?: Scripted[];
} = {}) => {
  const fs = new FakeFs(
    state === undefined ? {} : { [ENTITLEMENT_FILE]: stateFile(state) }
  );
  const clock = new FakeClock(NOW);
  const api = new FakeEntitlementApi(answers);
  const network = new FakeOnline(online);
  const power = new FakePower();
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({
    log: strictLog,
    transport,
  });
  registrar.assign(PAGE, chromeSurface);
  const events = new AppEvents();
  const changed: AppEventMap["entitlement.changed"][] = [];
  events.on("entitlement.changed", (payload) => {
    changed.push(payload);
  });
  const log = new FakeLog();
  const entitlement = new Entitlement({
    api,
    lifecycle: new FakeLifecycle(),
    clock,
    events,
    fs,
    ids: fakeIds("device-"),
    keys: new Map([[KID, pair.publicKey]]),
    online: network,
    log: log.scoped("entitlement"),
    power,
    registrar,
    subtle: crypto.subtle,
  });
  await entitlement.open();
  entitlement.attach();
  // Only what follows start() counts, so a value read from storage is not taken for a change.
  changed.length = 0;
  transport.sent.length = 0;
  return {
    api,
    changed,
    clock,
    entitlement,
    fs,
    network,
    power,
    registrar,
    log,
    transport,
    stored: async (): Promise<unknown> => {
      await entitlement.flush();
      const text = fs.files.get(ENTITLEMENT_FILE);
      return text === undefined ? undefined : JSON.parse(text);
    },
  };
};

const settled = async (api: FakeEntitlementApi, requests: number) => {
  await expect.poll(() => api.requests.length).toBe(requests);
};

describe(Entitlement, () => {
  it("is unknown on a fresh install that is offline, keeps a new device id, and asks once the network returns", async () => {
    const { api, entitlement, network, stored } = await setup({
      online: false,
    });
    entitlement.start();
    expect(entitlement.current()).toStrictEqual({
      expiresAt: null,
      kind: "unknown",
      source: "stored",
    });
    expect(api.requests).toStrictEqual([]);
    await expect(stored()).resolves.toMatchObject({
      data: { deviceId: "device-1", token: null },
    });
    network.set(true);
    await settled(api, 1);
  });

  it("starts licensed from a stored token that is still valid, asking nothing", async () => {
    const { api, entitlement } = await setup({
      state: { token: { licenseKey: null, value: await mint() } },
    });
    entitlement.start();
    expect(entitlement.current()).toStrictEqual({
      deviceLimit: 3,
      expiresAt: NOW + HOUR,
      kind: "licensed",
      plan: "pro",
      seat: null,
      source: "stored",
    });
    expect(api.requests).toStrictEqual([]);
  });

  it("keeps the stored kind while offline with an expired token, and refreshes when the network returns", async () => {
    const expired = await mint({ exp: (NOW - HOUR) / 1000 });
    const { api, entitlement, network, stored } = await setup({
      answers: [issued({ exp: (NOW + 3 * HOUR) / 1000 })],
      online: false,
      state: { token: { licenseKey: null, value: expired } },
    });
    entitlement.start();
    expect(entitlement.current()).toMatchObject({
      expiresAt: NOW - HOUR,
      kind: "licensed",
      source: "stored",
    });
    expect(api.requests).toStrictEqual([]);

    network.set(true);
    await settled(api, 1);
    await expect
      .poll(() => entitlement.current())
      .toMatchObject({ expiresAt: NOW + 3 * HOUR, source: "refreshed" });
    network.set(false);
    network.set(true);
    expect(api.requests).toHaveLength(1);
    await expect(stored()).resolves.toMatchObject({
      data: { lastAnswer: { at: NOW, detail: null, outcome: "issued" } },
    });
  });

  it("refreshes an expired token at start when online", async () => {
    const { api, entitlement } = await setup({
      answers: [issued({ plan: "team", seat: "seat-4" })],
      state: {
        licenseKey: "KEY-1",
        token: {
          licenseKey: "KEY-1",
          value: await mint({ exp: (NOW - 1000) / 1000 }),
        },
      },
    });
    entitlement.start();
    await settled(api, 1);
    expect(api.requests).toStrictEqual([
      { deviceId: DEVICE, licenseKey: "KEY-1" },
    ]);
    await expect
      .poll(() => entitlement.current())
      .toMatchObject({ kind: "licensed", plan: "team", seat: "seat-4" });
  });

  it("refreshes when the clock reaches the token's expiry, and again at the new one", async () => {
    const { api, clock, entitlement } = await setup({
      answers: [issued({ exp: (NOW + 4 * HOUR) / 1000 })],
      state: { token: { licenseKey: null, value: await mint() } },
    });
    entitlement.start();
    clock.advance(HOUR - 1);
    expect(api.requests).toHaveLength(0);
    clock.advance(1);
    await settled(api, 1);
    await expect
      .poll(() => entitlement.current().expiresAt)
      .toBe(NOW + 4 * HOUR);
    clock.advance(3 * HOUR - 1);
    expect(api.requests).toHaveLength(1);
    clock.advance(1);
    await settled(api, 2);
  });

  it("refreshes once on waking when the token expired during a sleep", async () => {
    const { api, clock, entitlement, power } = await setup({
      answers: [issued({ exp: (NOW + 4 * HOUR) / 1000 })],
      state: { token: { licenseKey: null, value: await mint() } },
    });
    entitlement.start();
    clock.sleep(2 * HOUR);
    expect(api.requests).toHaveLength(0);
    power.resume();
    await settled(api, 1);
    await expect
      .poll(() => entitlement.current().expiresAt)
      .toBe(NOW + 4 * HOUR);
    clock.advance(HOUR);
    expect(api.requests).toHaveLength(1);
  });

  it("flips to disabled with the reason, pushes and emits once, and stores the answer", async () => {
    const disabled = {
      reason: "refunded",
      status: "disabled",
    } as const;
    const { api, changed, clock, entitlement, stored } = await setup({
      answers: [
        issued({ ...disabled, exp: (NOW + 2 * HOUR) / 1000 }),
        issued({ ...disabled, exp: (NOW + 3 * HOUR) / 1000 }),
      ],
      state: { token: { licenseKey: null, value: await mint() } },
    });
    entitlement.start();
    clock.advance(HOUR);
    await settled(api, 1);
    await expect.poll(() => entitlement.current().kind).toBe("disabled");
    clock.advance(HOUR);
    await settled(api, 2);
    await expect
      .poll(() => entitlement.current().expiresAt)
      .toBe(NOW + 3 * HOUR);

    const value = {
      expiresAt: NOW + 2 * HOUR,
      kind: "disabled",
      reason: "refunded",
      source: "refreshed",
    };
    expect(changed).toStrictEqual([{ entitlement: value }]);
    await expect(stored()).resolves.toMatchObject({
      data: { lastAnswer: { outcome: "issued" } },
    });
  });

  it("is a trial with its end from trial claims", async () => {
    const endsAt = (NOW + 14 * 24 * HOUR) / 1000;
    const { api, entitlement } = await setup({
      answers: [issued({ endsAt, plan: "trial" })],
    });
    entitlement.start();
    await settled(api, 1);
    await expect
      .poll(() => entitlement.current())
      .toStrictEqual({
        endsAt: endsAt * 1000,
        expiresAt: NOW + HOUR,
        kind: "trial",
        source: "refreshed",
      });
  });

  it("becomes free when the trial ends while its token is still valid", async () => {
    const { clock, entitlement } = await setup({
      state: {
        token: {
          licenseKey: null,
          value: await mint({
            endsAt: (NOW + HOUR / 2) / 1000,
            plan: "trial",
          }),
        },
      },
    });
    entitlement.start();
    expect(entitlement.current().kind).toBe("trial");
    clock.advance(HOUR / 2);
    expect(entitlement.current().kind).toBe("free");
  });

  it("falls back to a trial request when a license key is rejected while the trial runs, and asks about the key again an hour on", async () => {
    const endsAt = (NOW + 7 * 24 * HOUR) / 1000;
    const rejected: Scripted = err({
      kind: "rejected",
      reason: "unknownLicenseKey",
    });
    const { api, clock, entitlement, log } = await setup({
      answers: [rejected, issued({ endsAt, plan: "trial" }), issued()],
      state: {
        token: {
          licenseKey: null,
          value: await mint({ endsAt, plan: "trial" }),
        },
      },
    });
    entitlement.start();
    entitlement.setLicenseKey("BAD-KEY");
    await settled(api, 2);
    expect(api.requests.map(({ licenseKey }) => licenseKey)).toStrictEqual([
      "BAD-KEY",
      null,
    ]);
    expect(log.entries).toStrictEqual([
      {
        fields: { detail: "unknownLicenseKey", kind: "rejected" },
        level: "warn",
        message: "The API refused the request",
        scope: "entitlement",
      },
    ]);
    await expect
      .poll(() => entitlement.current())
      .toMatchObject({ kind: "trial", source: "refreshed" });

    clock.advance(HOUR - 1);
    expect(api.requests).toHaveLength(2);
    clock.advance(1);
    await settled(api, 3);
    expect(api.requests.at(-1)).toStrictEqual({
      deviceId: DEVICE,
      licenseKey: "BAD-KEY",
    });
    await expect.poll(() => entitlement.current().kind).toBe("licensed");
  });

  it.each([
    [
      "the trial has ended",
      { endsAt: (NOW - HOUR) / 1000, plan: "trial" } as const,
      null,
    ],
    ["there is no trial token", {}, "KEY-1"],
  ])(
    "is free when a license key is rejected and %s, keeping the reason",
    async (_name, claims, tokenKey) => {
      const token = await mint({ ...claims, exp: (NOW - 1000) / 1000 });
      const { api, entitlement, stored } = await setup({
        answers: [err({ kind: "rejected", reason: "unknownLicenseKey" })],
        state: {
          licenseKey: "KEY-1",
          token: { licenseKey: tokenKey, value: token },
        },
      });
      entitlement.start();
      await settled(api, 1);
      await expect.poll(() => entitlement.current().kind).toBe("free");
      expect(api.requests).toHaveLength(1);
      await expect(stored()).resolves.toMatchObject({
        data: {
          lastAnswer: { detail: "unknownLicenseKey", outcome: "rejected" },
          rejected: { at: NOW, licenseKey: "KEY-1" },
        },
      });
    }
  );

  it("asks again after a server error, waiting longer each time", async () => {
    const failure: Scripted = err({ detail: "HTTP 503", kind: "serverError" });
    const { api, clock, entitlement, log } = await setup({
      answers: [failure, failure, issued()],
    });
    entitlement.start();
    await expect.poll(() => log.at("warn")).toHaveLength(1);
    clock.advance(60_000 - 1);
    expect(api.requests).toHaveLength(1);
    clock.advance(1);
    await expect.poll(() => log.at("warn")).toHaveLength(2);
    clock.advance(120_000 - 1);
    expect(api.requests).toHaveLength(2);
    clock.advance(1);
    await settled(api, 3);
    await expect.poll(() => entitlement.current().kind).toBe("licensed");
  });

  it("asks for a token for a license key as soon as it is set", async () => {
    const { api, entitlement } = await setup({
      answers: [
        issued({ endsAt: (NOW + HOUR) / 1000, plan: "trial" }),
        issued(),
      ],
    });
    entitlement.start();
    await settled(api, 1);
    await expect.poll(() => entitlement.current().kind).toBe("trial");
    entitlement.setLicenseKey("KEY-2");
    await settled(api, 2);
    expect(api.requests.at(-1)).toStrictEqual({
      deviceId: DEVICE,
      licenseKey: "KEY-2",
    });
    await expect.poll(() => entitlement.current().kind).toBe("licensed");
  });

  it("asks again at start when the stored token was issued for another license key", async () => {
    const { api, entitlement } = await setup({
      answers: [issued()],
      state: {
        licenseKey: "KEY-3",
        token: {
          licenseKey: null,
          value: await mint({ endsAt: (NOW + HOUR) / 1000, plan: "trial" }),
        },
      },
    });
    expect(entitlement.current().kind).toBe("trial");
    entitlement.start();
    await settled(api, 1);
    expect(api.requests).toStrictEqual([
      { deviceId: DEVICE, licenseKey: "KEY-3" },
    ]);
    await expect.poll(() => entitlement.current().kind).toBe("licensed");
  });

  it("drops a stored token issued to another device", async () => {
    const { entitlement, log, stored } = await setup({
      online: false,
      state: {
        token: { licenseKey: null, value: await mint({ sub: "device-2" }) },
      },
    });
    expect(entitlement.current().kind).toBe("unknown");
    expect(log.entries).toStrictEqual([
      {
        fields: { kind: "wrongDevice" },
        level: "warn",
        message: "A token was refused",
        scope: "entitlement",
      },
    ]);
    await expect(stored()).resolves.toMatchObject({ data: { token: null } });
  });

  it("answers a page's snapshot with the value as it stands", async () => {
    const { registrar } = await setup({
      state: { token: { licenseKey: null, value: await mint() } },
    });
    expect(
      registrar.dispatch(PAGE, wireName(channels.snapshot), {})
    ).toMatchObject({
      ok: true,
      value: { kind: "licensed" },
    });
  });
});
