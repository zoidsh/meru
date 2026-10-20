import { describe, expect, test } from "bun:test";
import type { Config, NotificationTime } from "@meru/shared/types";
import {
  checkWithinNotificationTimes,
  createNewEmailSoundGate,
  resolveNewEmailSound,
  shouldPlayNewEmailSound,
} from "./notifications";

function makeTime(start: string, end: string, days?: number[]): NotificationTime {
  return {
    id: "test-id",
    start,
    end,
    days,
  };
}

// Jan 1 2024 was a Monday (getDay() = 1), so offset dayOfWeek by 1 to get correct days
const makeDate = (dayOfWeek: number, hours: number, minutes: number) => {
  const date = new Date(2024, 0, dayOfWeek); // 0=Sun(Dec31), 1=Mon(Jan1), ..., 6=Sat(Jan6)
  date.setHours(hours, minutes, 0, 0);
  return date;
};

describe("checkWithinNotificationTimes", () => {
  test("returns true when times list is empty", () => {
    const now = makeDate(1, 10, 0);
    expect(checkWithinNotificationTimes([], now)).toBe(true);
  });

  test("returns true when current time is within a window", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 12, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(true);
  });

  test("returns false when current time is outside all windows", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 18, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(false);
  });

  test("returns false at the exact end time (exclusive)", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 17, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(false);
  });

  test("returns true at the exact start time (inclusive)", () => {
    const times = [makeTime("09:00", "17:00")];
    const now = makeDate(1, 9, 0);
    expect(checkWithinNotificationTimes(times, now)).toBe(true);
  });

  test("overnight window includes time after midnight", () => {
    const times = [makeTime("22:00", "06:00")];
    const nowAfterMidnight = makeDate(1, 2, 0);
    expect(checkWithinNotificationTimes(times, nowAfterMidnight)).toBe(true);
  });

  test("overnight window includes time before midnight", () => {
    const times = [makeTime("22:00", "06:00")];
    const nowBeforeMidnight = makeDate(1, 23, 0);
    expect(checkWithinNotificationTimes(times, nowBeforeMidnight)).toBe(true);
  });

  test("overnight window excludes time in the middle of the day", () => {
    const times = [makeTime("22:00", "06:00")];
    const nowMiddleOfDay = makeDate(1, 12, 0);
    expect(checkWithinNotificationTimes(times, nowMiddleOfDay)).toBe(false);
  });

  test("returns true when no days are set (undefined) regardless of day", () => {
    const times = [makeTime("09:00", "17:00", undefined)];
    const sunday = makeDate(0, 12, 0);
    expect(checkWithinNotificationTimes(times, sunday)).toBe(true);
  });

  test("returns true when days array is empty regardless of day", () => {
    const times = [makeTime("09:00", "17:00", [])];
    const sunday = makeDate(0, 12, 0);
    expect(checkWithinNotificationTimes(times, sunday)).toBe(true);
  });

  test("returns true when current day matches a day-specific window", () => {
    const times = [makeTime("09:00", "17:00", [1, 2, 3, 4, 5])];
    const monday = makeDate(1, 12, 0);
    expect(checkWithinNotificationTimes(times, monday)).toBe(true);
  });

  test("returns false when current day does not match a day-specific window", () => {
    const times = [makeTime("09:00", "17:00", [1, 2, 3, 4, 5])];
    const saturday = makeDate(6, 12, 0);
    expect(checkWithinNotificationTimes(times, saturday)).toBe(false);
  });

  test("all 7 days set behaves like every day", () => {
    const times = [makeTime("09:00", "17:00", [0, 1, 2, 3, 4, 5, 6])];
    const sunday = makeDate(0, 12, 0);
    expect(checkWithinNotificationTimes(times, sunday)).toBe(true);
  });

  test("day-agnostic and day-specific windows are independent (no precedence)", () => {
    const everyDay = makeTime("09:00", "17:00");
    const mondayOnly = makeTime("10:00", "12:00", [1]);
    const times = [everyDay, mondayOnly];

    // Monday 9:30 — everyDay matches even though mondayOnly does not cover 9:30
    const monday930 = makeDate(1, 9, 30);
    expect(checkWithinNotificationTimes(times, monday930)).toBe(true);
  });

  test("returns true if any of multiple windows matches", () => {
    const morningWindow = makeTime("08:00", "10:00");
    const eveningWindow = makeTime("18:00", "20:00");
    const times = [morningWindow, eveningWindow];

    expect(checkWithinNotificationTimes(times, makeDate(1, 9, 0))).toBe(true);
    expect(checkWithinNotificationTimes(times, makeDate(1, 14, 0))).toBe(false);
    expect(checkWithinNotificationTimes(times, makeDate(1, 19, 0))).toBe(true);
  });
});

describe("shouldPlayNewEmailSound", () => {
  function soundsFor(times: number[]) {
    let last: number | undefined;

    return times.map((now) => {
      const sounds = shouldPlayNewEmailSound(now, last);
      last = now;
      return sounds;
    });
  }

  test("the first notification plays a sound", () => {
    expect(shouldPlayNewEmailSound(1000)).toBe(true);
  });

  test("a notification within 5 seconds of the last is silent", () => {
    expect(soundsFor([1000, 1000, 1000, 5999])).toEqual([true, false, false, false]);
  });

  test("a chain 4 seconds apart stays silent after the first", () => {
    expect(soundsFor([0, 4000, 8000, 12000, 16000])).toEqual([true, false, false, false, false]);
  });

  test("a notification after 5 seconds of quiet plays a sound", () => {
    expect(soundsFor([0, 4000, 9000, 20000])).toEqual([true, false, true, true]);
  });
});

describe("resolveNewEmailSound", () => {
  const resolve = (
    isMacOS: boolean,
    isLicensed: boolean,
    sound: Config["notifications.sound"],
    playSound = true,
  ) => resolveNewEmailSound({ isMacOS, isLicensed, sound, playSound });

  describe("on macOS", () => {
    test("a licensed user hears the built-in sound they picked, carried by the notification", () => {
      expect(resolve(true, true, "Tink")).toEqual({ silent: false, sound: "Tink" });
    });

    test("a licensed user on System hears the macOS alert sound", () => {
      expect(resolve(true, true, "system")).toEqual({ silent: false });
    });

    test("a stored bundled sound plays Blow", () => {
      for (const sound of ["breeze", "chime", "duet", "knock", "linen"] as const) {
        expect(resolve(true, true, sound)).toEqual({ silent: false, sound: "Blow" });
      }
    });

    test("an unlicensed user always hears Blow", () => {
      for (const sound of ["Tink", "system", "linen"] as const) {
        expect(resolve(true, false, sound)).toEqual({ silent: false, sound: "Blow" });
      }
    });

    test("nothing plays in the renderer", () => {
      for (const isLicensed of [true, false]) {
        for (const sound of ["Tink", "system", "linen"] as const) {
          expect(resolve(true, isLicensed, sound).rendererSound).toBeUndefined();
        }
      }
    });

    test("a notification the gate or the setting quiets is silent", () => {
      for (const isLicensed of [true, false]) {
        for (const sound of ["Tink", "system", "linen"] as const) {
          expect(resolve(true, isLicensed, sound, false)).toEqual({ silent: true });
        }
      }
    });
  });

  describe("on Windows and Linux", () => {
    test("a licensed user hears the bundled sound they picked, played by the renderer", () => {
      expect(resolve(false, true, "chime")).toEqual({ silent: true, rendererSound: "chime" });
    });

    test("an unlicensed user hears Linen", () => {
      expect(resolve(false, false, "chime")).toEqual({ silent: true, rendererSound: "linen" });
    });

    test("System plays the platform's sound for a licensed user only", () => {
      expect(resolve(false, true, "system")).toEqual({ silent: false });
      expect(resolve(false, false, "system")).toEqual({ silent: true });
    });

    test("a stored built-in macOS sound plays Linen", () => {
      expect(resolve(false, true, "Tink")).toEqual({ silent: true, rendererSound: "linen" });
    });

    test("a notification the gate or the setting quiets is silent", () => {
      expect(resolve(false, true, "chime", false)).toEqual({ silent: true });
      expect(resolve(false, true, "system", false)).toEqual({ silent: true });
      expect(resolve(false, false, "chime", false)).toEqual({ silent: true });
    });
  });
});

describe("createNewEmailSoundGate", () => {
  function createGate(isMacOS: boolean) {
    let time = 0;
    let pendingTaskEnds: (() => void)[] = [];

    const allowsSound = createNewEmailSoundGate({
      isMacOS,
      now: () => time,
      afterTask: (callback) => pendingTaskEnds.push(callback),
    });

    return {
      allowsSound,
      /** Ends the current task, then moves the clock on. */
      later(ms: number) {
        const taskEnds = pendingTaskEnds;
        pendingTaskEnds = [];
        for (const taskEnd of taskEnds) {
          taskEnd();
        }
        time += ms;
      },
    };
  }

  const postBatch = (allowsSound: () => boolean, count: number) =>
    Array.from({ length: count }, () => allowsSound());

  test("on macOS, every notification of the task that opened the sound carries it", () => {
    const { allowsSound } = createGate(true);

    expect(postBatch(allowsSound, 5)).toEqual([true, true, true, true, true]);
  });

  test("on macOS, a batch in a later task within 5 seconds is silent", () => {
    const { allowsSound, later } = createGate(true);

    postBatch(allowsSound, 2);
    later(300);

    expect(postBatch(allowsSound, 3)).toEqual([false, false, false]);
  });

  test("on macOS, notifications a second apart sound only the first", () => {
    const { allowsSound, later } = createGate(true);
    const sounds = [];

    for (let i = 0; i < 5; i++) {
      sounds.push(allowsSound());
      later(1000);
    }

    expect(sounds).toEqual([true, false, false, false, false]);
  });

  test("on macOS, a batch after 5 seconds of quiet sounds again", () => {
    const { allowsSound, later } = createGate(true);

    postBatch(allowsSound, 2);
    later(6000);

    expect(postBatch(allowsSound, 2)).toEqual([true, true]);
  });

  test("on Windows and Linux, only the first notification of a batch sounds", () => {
    const { allowsSound, later } = createGate(false);

    expect(postBatch(allowsSound, 3)).toEqual([true, false, false]);

    later(6000);

    expect(allowsSound()).toBe(true);
  });
});
