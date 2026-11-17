import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DO_NOT_DISTURB_DURATIONS } from "#core/notification-gate.ts";
import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { COMMANDS } from "./commands.ts";
import type { CommandContext } from "./commands.ts";
import { createDoNotDisturb, doNotDisturbItems } from "./do-not-disturb.ts";
import { createProfiles } from "./profiles.ts";

const START = new Date(2026, 10, 17, 14).getTime();
const MINUTE = 60_000;

const one: State = {
  version: 1,
  profiles: [newProfile("a", "Default")],
  selectedProfileId: "a",
};

const setup = (initial: State = one) => {
  const saved: State[] = [];
  const profiles = createProfiles({
    initial,
    save: (state) => {
      saved.push(state);

      return Promise.resolve();
    },
    newId: () => "new",
    profileName: (n) => `Profile ${n}`,
    clearSession: () => Promise.resolve(),
    now: Date.now,
    log: () => false,
  });
  const doNotDisturb = createDoNotDisturb({
    profiles,
    now: () => new Date(),
    log: () => false,
  });

  return { profiles, doNotDisturb, saved };
};

const duration = (id: string) => {
  const found = DO_NOT_DISTURB_DURATIONS.find(
    (candidate) => candidate.id === id
  );

  if (!found) {
    throw new Error(`No duration ${id}`);
  }

  return found;
};

describe(createDoNotDisturb, () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("switches itself off, saved, when its time ends while Meru runs", async () => {
    const { profiles, doNotDisturb, saved } = setup();

    await doNotDisturb.switchOn(duration("15m"));

    expect(doNotDisturb.current()).toStrictEqual({
      until: START + 15 * MINUTE,
    });

    await vi.advanceTimersByTimeAsync(15 * MINUTE - 1);

    expect(profiles.get().doNotDisturb).toBeDefined();

    await vi.advanceTimersByTimeAsync(1);

    expect(doNotDisturb.current()).toBeUndefined();
    expect(profiles.get()).not.toHaveProperty("doNotDisturb");
    expect(saved.at(-1)).not.toHaveProperty("doNotDisturb");
    doNotDisturb.dispose();
  });

  it("reads one that ended while Meru was closed as off, and writes nothing for it at launch", async () => {
    const { doNotDisturb, saved } = setup({
      ...one,
      doNotDisturb: { until: START - MINUTE },
    });

    expect(doNotDisturb.current()).toBeUndefined();

    await vi.advanceTimersByTimeAsync(60 * MINUTE);

    expect(saved).toStrictEqual([]);
    doNotDisturb.dispose();
  });

  it("carries on until its time after a restart", async () => {
    const { doNotDisturb, saved } = setup({
      ...one,
      doNotDisturb: { until: START + MINUTE },
    });

    expect(doNotDisturb.current()).toStrictEqual({ until: START + MINUTE });

    await vi.advanceTimersByTimeAsync(MINUTE);

    expect(doNotDisturb.current()).toBeUndefined();
    expect(saved).toHaveLength(1);
    doNotDisturb.dispose();
  });

  it("switches one off on waking when its time passed during sleep", async () => {
    const { profiles, doNotDisturb } = setup();

    await doNotDisturb.switchOn(duration("5m"));
    doNotDisturb.dispose();
    // The computer slept through the end, and the timer did not fire.
    vi.setSystemTime(START + 10 * MINUTE);
    doNotDisturb.resume();
    await vi.advanceTimersByTimeAsync(0);

    expect(profiles.get()).not.toHaveProperty("doNotDisturb");
    doNotDisturb.dispose();
  });

  it("never ends one until turned off", async () => {
    const { doNotDisturb } = setup();

    await doNotDisturb.switchOn(duration("untilOff"));
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * MINUTE);

    expect(doNotDisturb.current()).toStrictEqual({ until: null });

    await doNotDisturb.switchOff();

    expect(doNotDisturb.current()).toBeUndefined();
    doNotDisturb.dispose();
  });

  it("waits out an end further off than a timer can wait, without ending early", async () => {
    const farOff = START + 40 * 24 * 60 * MINUTE;
    const { doNotDisturb } = setup({ ...one, doNotDisturb: { until: farOff } });

    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * MINUTE);

    expect(doNotDisturb.current()).toStrictEqual({ until: farOff });

    await vi.advanceTimersByTimeAsync(10 * 24 * 60 * MINUTE);

    expect(doNotDisturb.current()).toBeUndefined();
    doNotDisturb.dispose();
  });
});

const labels = (context: Partial<CommandContext>) =>
  doNotDisturbItems(
    COMMANDS,
    {
      state: one,
      setting: (() => true) as CommandContext["setting"],
      doNotDisturb: undefined,
      ...context,
    },
    "en-GB",
    () => false
  ).map((item) => ("label" in item ? item.label : "—"));

describe(doNotDisturbItems, () => {
  const DURATIONS = [
    "Until Turned Off",
    "For 5 Minutes",
    "For 10 Minutes",
    "For 15 Minutes",
    "For 30 Minutes",
    "For 1 Hour",
    "For 2 Hours",
    "For 4 Hours",
    "For 8 Hours",
    "For 12 Hours",
    "Until Tomorrow",
  ];

  it("offers the durations while off", () => {
    expect(labels({})).toStrictEqual(DURATIONS);
  });

  it("says until when while on, in the app's language, then offers to turn it off", () => {
    expect([
      labels({
        doNotDisturb: { until: new Date(2026, 10, 17, 14, 30).getTime() },
      }),
      labels({ doNotDisturb: { until: null } }),
    ]).toStrictEqual([
      ["On Until 14:30", "Turn Off", "—", ...DURATIONS],
      ["On Until Turned Off", "Turn Off", "—", ...DURATIONS],
    ]);
  });
});
