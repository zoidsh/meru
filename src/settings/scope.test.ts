import { describe, expect, it } from "vitest";

import type { PageSettings } from "#contract/settings.ts";
import type { SoundChoice } from "#core/sounds.ts";

import {
  appValueText,
  differingProfiles,
  differsText,
  effectiveSettings,
  foldsIntoMenu,
  overrideCount,
  shownScope,
  splitDiffering,
} from "./scope.ts";
import type { ListedProfile } from "./scope.ts";

const profile = (
  id: string,
  overrides: ListedProfile["overrides"] = {}
): ListedProfile => ({ id, name: id, color: "#2d52d2", overrides });

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
};

describe(shownScope, () => {
  it("keeps a listed profile's scope, and falls back to All profiles once it goes or one profile is left", () => {
    const two = [profile("home"), profile("work")];

    expect([
      shownScope("work", two),
      shownScope("gone", two),
      shownScope("work", [profile("work")]),
      shownScope("all", two),
    ]).toStrictEqual(["work", "all", "all", "all"]);
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

describe(foldsIntoMenu, () => {
  it("folds the segments only when laid out whole they need more than the room", () => {
    expect([
      foldsIntoMenu(400, 532),
      foldsIntoMenu(532, 532),
      foldsIntoMenu(533, 532),
    ]).toStrictEqual([false, false, true]);
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
