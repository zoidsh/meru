import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_SOUNDS,
  SOUND_QUIET_PERIOD,
  decideSound,
  soundVolumeSchema,
  sounds,
} from "./sounds.ts";
import type { SoundChoice } from "./sounds.ts";

/** Each notification at its time, the quiet period followed as a caller does. */
const run = (choice: SoundChoice, times: readonly number[]) => {
  let last: number | undefined;

  return times.map((now) => {
    const decision = decideSound(choice, now, last);

    if (sounds(decision)) {
      last = now;
    }

    return decision;
  });
};

describe(decideSound, () => {
  it("plays Meru's sound with a silent notification, once for notifications shown together", () => {
    expect(run("linen", [1000, 1000, 1000, 5999])).toStrictEqual([
      { silent: true, play: "linen" },
      { silent: true, play: undefined },
      { silent: true, play: undefined },
      { silent: true, play: undefined },
    ]);
  });

  it("times the quiet period from the last sound, so a steady stream still sounds every 5 s", () => {
    expect(
      run("chime", [0, 4000, 8000, 12_000, 16_000]).map(({ play }) => play)
    ).toStrictEqual(["chime", undefined, "chime", undefined, "chime"]);
  });

  it("sounds again once the quiet period has passed", () => {
    expect(
      run("duet", [0, SOUND_QUIET_PERIOD - 1, SOUND_QUIET_PERIOD]).map(
        ({ play }) => play
      )
    ).toStrictEqual(["duet", undefined, "duet"]);
  });

  it("lets the system sound only the first of a burst, and Meru plays nothing", () => {
    expect(run("system", [0, 1000, 6000])).toStrictEqual([
      { silent: false, play: undefined },
      { silent: true, play: undefined },
      { silent: false, play: undefined },
    ]);
  });

  it("makes no sound at all with none, and starts no quiet period", () => {
    expect(run("none", [0, 1000])).toStrictEqual([
      { silent: true, play: undefined },
      { silent: true, play: undefined },
    ]);
    expect(sounds(decideSound("none", 0, undefined))).toBeFalsy();
  });

  it("ends the quiet period when the clock is set back before the last sound", () => {
    expect(decideSound("knock", 1000, 50_000).play).toBe("knock");
  });

  it("plays every one of Meru's sounds as chosen", () => {
    for (const sound of NOTIFICATION_SOUNDS) {
      expect(decideSound(sound, 0, undefined)).toStrictEqual({
        silent: true,
        play: sound,
      });
    }
  });
});

const accepted = (volume: unknown) =>
  soundVolumeSchema.safeParse(volume).success;

describe("the volume of Meru's sounds", () => {
  it("takes 5% to 100% and nothing else", () => {
    expect([0.05, 0.5, 1].map(accepted)).toStrictEqual([true, true, true]);
    expect(
      [0, 0.04, 1.01, -1, Number.NaN, Infinity, "1"].some(accepted)
    ).toBeFalsy();
  });
});
