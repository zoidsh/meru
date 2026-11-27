import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOUNDS,
  NEW_EMAIL_SOUNDS,
  NEW_EMAIL_SOUND_CHOICES,
  NOTIFICATION_SOUNDS,
  OTHER_SOUNDS,
  OTHER_SOUND_CHOICES,
  SOUND_QUIET_PERIOD,
  decideSound,
  soundVolumeSchema,
  sounds,
} from "./sounds.ts";

// How a burst follows from these, kept by `createMailNotifications`, is
// proven in src/main/notifications.test.ts.

describe("Meru's sounds", () => {
  it("are twelve for new email and seven for the rest, none in both, each role's default first", () => {
    expect([
      NEW_EMAIL_SOUNDS.length,
      OTHER_SOUNDS.length,
      new Set(NOTIFICATION_SOUNDS).size,
      DEFAULT_SOUNDS,
      NEW_EMAIL_SOUNDS[0],
      OTHER_SOUNDS[0],
    ]).toStrictEqual([
      12,
      7,
      19,
      { newEmail: "welcome", other: "nod" },
      "welcome",
      "nod",
    ]);
  });

  it("offer each role its own sounds, the system's and none, and never the other role's", () => {
    expect([
      NEW_EMAIL_SOUND_CHOICES.slice(-2),
      OTHER_SOUND_CHOICES.slice(-2),
      NEW_EMAIL_SOUND_CHOICES.some((choice) =>
        (OTHER_SOUNDS as readonly string[]).includes(choice)
      ),
      OTHER_SOUND_CHOICES.some((choice) =>
        (NEW_EMAIL_SOUNDS as readonly string[]).includes(choice)
      ),
    ]).toStrictEqual([["system", "none"], ["system", "none"], false, false]);
  });
});

describe(decideSound, () => {
  it("plays each of Meru's sounds with a silent notification when none has played", () => {
    for (const sound of NOTIFICATION_SOUNDS) {
      expect(decideSound(sound, 0, undefined)).toStrictEqual({
        silent: true,
        play: sound,
      });
    }
  });

  it("plays none within the quiet period after the last sound, and plays again at its end", () => {
    expect([
      decideSound("welcome", 1000, 1000),
      decideSound("welcome", 1000 + SOUND_QUIET_PERIOD - 1, 1000),
      decideSound("welcome", 1000 + SOUND_QUIET_PERIOD, 1000),
    ]).toStrictEqual([
      { silent: true, play: undefined },
      { silent: true, play: undefined },
      { silent: true, play: "welcome" },
    ]);
  });

  it("lets the system sound only outside the quiet period, and Meru plays nothing", () => {
    expect([
      decideSound("system", 0, undefined),
      decideSound("system", 1000, 0),
      decideSound("system", SOUND_QUIET_PERIOD, 0),
    ]).toStrictEqual([
      { silent: false, play: undefined },
      { silent: true, play: undefined },
      { silent: false, play: undefined },
    ]);
  });

  it("makes no sound with none, whenever the last one was", () => {
    expect([
      decideSound("none", 0, undefined),
      decideSound("none", SOUND_QUIET_PERIOD, 0),
    ]).toStrictEqual([
      { silent: true, play: undefined },
      { silent: true, play: undefined },
    ]);
  });

  it("ends the quiet period when the clock is set back before the last sound", () => {
    expect(decideSound("knock", 1000, 50_000).play).toBe("knock");
  });
});

describe(sounds, () => {
  it("is a sound of Meru's or the system's, which starts a quiet period, and not a silent one", () => {
    expect([
      sounds({ silent: true, play: "duet" }),
      sounds({ silent: false, play: undefined }),
      sounds({ silent: true, play: undefined }),
    ]).toStrictEqual([true, true, false]);
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
