import { describe, expect, it } from "vitest";

import {
  NOTIFICATIONS_OVERRIDABLE_KEYS,
  TABS_APPS_OVERRIDABLE_KEYS,
} from "#contract/settings.ts";
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
  enabled: true,
  asleep: false,
  checkMail: true,
  unifiedInbox: true,
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
  downloadsFolder: null,
  notificationSoundVolume: 1,
  hidePromoBanner: true,
  hideUpgradeButton: true,
  hideInboxFooter: true,
  extendDarkTheme: true,
  reverseConversation: false,
  moveAttachmentsToTop: false,
  showTrimmedContent: false,
  closeComposeWindowAfterSend: false,
  verificationCodes: true,
  verificationCodesDuringDoNotDisturb: true,
  verificationCodeCopyMode: "notificationClick",
  verificationCodeAfterCopy: "nothing",
  language: "system",
  spellcheckLanguages: [],
  openInBackground: false,
  downloadsSaveAs: false,
  downloadsShowInFolder: false,
  theme: "system",
  profileTint: true,
  profileTintStrength: "medium",
  titlebarNewTab: true,
  titlebarUnifiedInbox: true,
  titlebarDownloads: true,
  titlebarDoNotDisturb: true,
  dockIcon: true,
  tray: false,
  trayUnreadCount: true,
  trayIconColor: "system",
  trayJumpsToUnread: false,
  blockAds: true,
  blockTrackers: true,
  confirmLinks: true,
  openAppsInMeru: true,
  appsInDefaultBrowser: [],
  sleepIdleTabs: "unpinned",
  sleepAfter: "1h",
  hardwareAcceleration: true,
  systemScreenPicker: true,
  autoUpdate: true,
  updateChannel: "stable",
};

const NOTIFICATIONS = NOTIFICATIONS_OVERRIDABLE_KEYS;

describe(isScoped, () => {
  it("has scopes with two profiles, or one that holds a value of its own", () => {
    expect([
      isScoped([profile("home"), profile("work")], NOTIFICATIONS),
      isScoped([profile("work", { notifications: false })], NOTIFICATIONS),
      isScoped([profile("work")], NOTIFICATIONS),
      isScoped([], NOTIFICATIONS),
    ]).toStrictEqual([true, true, false, false]);
  });

  it("counts a lone profile's own values of the page's settings alone, so another page's keep no scopes on this one", () => {
    const work = profile("work", { openAppsInMeru: false });

    expect([
      isScoped([work], TABS_APPS_OVERRIDABLE_KEYS),
      isScoped([work], NOTIFICATIONS),
      overrideCount(work, TABS_APPS_OVERRIDABLE_KEYS),
      overrideCount(work, NOTIFICATIONS),
    ]).toStrictEqual([true, false, 1, 0]);
  });
});

describe(shownScope, () => {
  it("keeps a listed profile's scope, and falls back to All profiles once it goes or one profile is left", () => {
    const two = [profile("home"), profile("work")];

    expect([
      shownScope("work", two, NOTIFICATIONS),
      shownScope("gone", two, NOTIFICATIONS),
      shownScope("work", [profile("work")], NOTIFICATIONS),
      shownScope(
        "work",
        [profile("work", { unreadBadge: false })],
        NOTIFICATIONS
      ),
      shownScope("all", two, NOTIFICATIONS),
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
      "Set differently for 1 profile:",
      "Set differently for 4 profiles:",
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
      overrideCount(work, NOTIFICATIONS),
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
