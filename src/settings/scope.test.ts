import { describe, expect, it } from "vitest";

import type { PageSettings } from "#contract/settings.ts";
import type { SoundChoice } from "#core/sounds.ts";

import {
  appValueText,
  differingProfiles,
  differsText,
  effectiveSettings,
  isScoped,
  overrideCount,
  shownScope,
  splitDiffering,
} from "./scope.ts";
import type { ListedProfile } from "./scope.ts";

const profile = (
  id: string,
  overrides: ListedProfile["overrides"] = {}
): ListedProfile => ({
  id,
  name: id,
  color: "#2d52d2",
  colorName: "blue",
  asleep: false,
  checkMail: true,
  mail: { status: "unknown", address: null },
  savedSearches: [],
  overrides,
});

const SOUNDS: Record<SoundChoice, string> = {
  none: "None",
  system: "System",
  breeze: "Breeze",
  chime: "Chime",
  duet: "Duet",
  knock: "Knock",
  linen: "Linen",
};

const APP: PageSettings = {
  notifications: true,
  notificationSender: true,
  notificationSubject: true,
  notificationSummary: true,
  notificationImportantOnly: false,
  quietHours: [],
  notificationSound: "linen",
  unreadBadge: true,
  unifiedInbox: true,
  notificationSoundVolume: 1,
};

describe(isScoped, () => {
  it("has scopes with two profiles, or one that holds a value of its own", () => {
    expect([
      isScoped([profile("home"), profile("work")]),
      isScoped([profile("work", { notifications: false })]),
      isScoped([profile("work")]),
      isScoped([]),
    ]).toStrictEqual([true, true, false, false]);
  });
});

describe(shownScope, () => {
  it("keeps a listed profile's scope, and falls back to All profiles once it goes or one profile is left", () => {
    const two = [profile("home"), profile("work")];

    expect([
      shownScope("work", two),
      shownScope("gone", two),
      shownScope("work", [profile("work")]),
      shownScope("work", [profile("work", { unreadBadge: false })]),
      shownScope("all", two),
    ]).toStrictEqual(["work", "all", "all", "work", "all"]);
  });
});

describe(differingProfiles, () => {
  it("names the profiles holding their own value of the key in their order, three of them, and counts the rest", () => {
    const profiles = ["a", "b", "c", "d", "e"].map((id) =>
      profile(id, id === "b" ? {} : { notifications: false })
    );
    const differing = differingProfiles(profiles, "notifications");
    const { shown, more } = splitDiffering(differing);

    expect([
      shown.map(({ id }) => id),
      more,
      splitDiffering(differing.slice(0, 2)).more,
      differingProfiles(profiles, "unreadBadge"),
    ]).toStrictEqual([["a", "c", "d"], 1, 0, []]);
  });

  it("counts in the line before the badges", () => {
    expect([differsText(1), differsText(4)]).toStrictEqual([
      "Differs in 1 profile:",
      "Differs in 4 profiles:",
    ]);
  });
});

describe(effectiveSettings, () => {
  it("reads the profile's own values over the app's, and counts them", () => {
    const work = profile("work", { notificationSound: "chime" });

    expect([
      effectiveSettings(APP, work).notificationSound,
      effectiveSettings(APP, work).notifications,
      effectiveSettings(APP, undefined),
      overrideCount(work),
    ]).toStrictEqual(["chime", true, APP, 1]);
  });
});

describe(appValueText, () => {
  it("names a switch's app value On or Off, the sound by its name, and quiet hours window by window", () => {
    expect([
      appValueText("notifications", true, SOUNDS, "en-GB"),
      appValueText("unreadBadge", false, SOUNDS, "en-GB"),
      appValueText("notificationSound", "chime", SOUNDS, "en-GB"),
      appValueText("quietHours", [], SOUNDS, "en-GB"),
      appValueText(
        "quietHours",
        [
          { start: "22:00", end: "07:00" },
          { start: "12:00", end: "13:00", days: [1, 2, 3, 4, 5] },
          { start: "09:00", end: "09:00", days: [0, 6] },
          { start: "18:00", end: "20:00", days: [3, 1] },
        ],
        SOUNDS,
        "en-GB"
      ),
    ]).toStrictEqual([
      "On",
      "Off",
      "Chime",
      "none",
      "22:00–07:00 every day; 12:00–13:00 weekdays; all day weekends; 18:00–20:00 Mon, Wed",
    ]);
  });
});
