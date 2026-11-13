import { describe, expect, it } from "vitest";

import {
  due,
  fallsBackToFree,
  nextDelay,
  nextWake,
  RETRY_FIRST,
  RETRY_MAX,
} from "./schedule.ts";
import type { ScheduleState } from "./schedule.ts";
import type { Claims } from "./token.ts";

const NOW = 1_800_000_000_000;
const seconds = (ms: number) => Math.floor(ms / 1000);

const claims = (fields: Partial<Claims> = {}): Claims => ({
  deviceLimit: 3,
  exp: seconds(NOW + 3_600_000),
  iat: seconds(NOW),
  plan: "pro",
  status: "active",
  sub: "device",
  ttl: 10_800,
  ...fields,
});

const trial = claims({
  endsAt: seconds(NOW + 7 * 86_400_000),
  plan: "trial",
});

const state = (fields: Partial<ScheduleState> = {}): ScheduleState => ({
  lastAnswer: null,
  licenseKey: null,
  rejected: null,
  token: null,
  ...fields,
});

const refused = state({
  lastAnswer: { outcome: "rejected" },
  licenseKey: "KEY",
  rejected: { at: NOW - 60_000, licenseKey: "KEY" },
  token: { licenseKey: null },
});

describe(due, () => {
  it("asks for a token when there is none, it expired or it was issued for another key", () => {
    expect([
      due(state(), undefined, NOW),
      due(
        state({ token: { licenseKey: null } }),
        claims({ exp: seconds(NOW) }),
        NOW
      ),
      due(
        state({ licenseKey: "KEY", token: { licenseKey: null } }),
        trial,
        NOW
      ),
      due(state({ token: { licenseKey: null } }), trial, NOW),
    ]).toStrictEqual([
      { licenseKey: null },
      { licenseKey: null },
      { licenseKey: "KEY" },
      undefined,
    ]);
  });

  it("asks about a refused key again an hour on, and for the trial meanwhile", () => {
    expect([
      due(refused, trial, NOW),
      due(refused, trial, NOW - 60_000 + RETRY_MAX),
      due({ ...refused, lastAnswer: { outcome: "issued" } }, trial, NOW),
    ]).toStrictEqual([{ licenseKey: null }, { licenseKey: "KEY" }, undefined]);
  });
});

describe(fallsBackToFree, () => {
  it("is free for a refused key once no trial runs", () => {
    expect([
      fallsBackToFree(refused, trial, NOW),
      fallsBackToFree(refused, claims(), NOW),
      fallsBackToFree(state(), undefined, NOW),
    ]).toStrictEqual([false, true, false]);
  });
});

describe(nextWake, () => {
  it("wakes at the nearest of the expiry, the trial's end and the hour after a refusal", () => {
    expect([
      nextWake(state(), trial, NOW),
      nextWake(refused, claims({ exp: seconds(NOW + 2 * RETRY_MAX) }), NOW),
      nextWake(state(), undefined, NOW),
    ]).toStrictEqual([trial.exp * 1000, NOW - 60_000 + RETRY_MAX, undefined]);
  });
});

describe(nextDelay, () => {
  it("backs off after a failure, within bounds, and not after a token or a refused key", () => {
    expect([
      nextDelay(0, "offline", null),
      nextDelay(RETRY_FIRST, "serverError", null),
      nextDelay(RETRY_MAX, "offline", null),
      nextDelay(RETRY_MAX, "issued", null),
      nextDelay(RETRY_FIRST, "rejected", "KEY"),
      nextDelay(0, "rejected", null),
    ]).toStrictEqual([
      RETRY_FIRST,
      2 * RETRY_FIRST,
      RETRY_MAX,
      0,
      0,
      RETRY_MAX,
    ]);
  });
});
