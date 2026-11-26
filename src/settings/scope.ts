import { plural, t } from "@lingui/core/macro";

import type {
  PageOverridableKey,
  PageSettings,
  SettingsState,
} from "#contract/settings.ts";
import type { QuietWindow } from "#core/notification-gate.ts";
import type { SoundChoice } from "#core/sounds.ts";

import { WEEK, dayName, quietDays } from "./quiet-hours.ts";

export type ListedProfile = SettingsState["profiles"][number];

/** `all` for All profiles, else one profile's id. */
export type Scope = string;

/** How many profiles a row names before it counts the rest. */
export const SHOWN_DIFFERING = 3;

/** A page's settings a profile may hold a value of its own for. */
export type PageKeys = readonly PageOverridableKey[];

/** How many of the page's settings, `keys`, the profile holds of its own. */
export const overrideCount = (profile: ListedProfile, keys: PageKeys) =>
  keys.filter((key) => Object.hasOwn(profile.overrides, key)).length;

/**
 * Whether the page has scopes: with two or more profiles, or one that still
 * holds a value of its own of the page's settings, until it holds none.
 */
export const isScoped = (profiles: readonly ListedProfile[], keys: PageKeys) =>
  profiles.length >= 2 ||
  profiles.some((profile) => overrideCount(profile, keys) > 0);

/**
 * The scope to show: the chosen one while the page has scopes and its
 * profile is listed, else All profiles.
 */
export const shownScope = (
  scope: Scope,
  profiles: readonly ListedProfile[],
  keys: PageKeys
): Scope =>
  isScoped(profiles, keys) && profiles.some((profile) => profile.id === scope)
    ? scope
    : "all";

/** The profiles holding a value of their own for the key, in their order. */
export const differingProfiles = (
  profiles: readonly ListedProfile[],
  key: PageOverridableKey
) => profiles.filter((profile) => Object.hasOwn(profile.overrides, key));

/** The profiles a row names, and how many more it only counts. */
export const splitDiffering = (differing: readonly ListedProfile[]) => ({
  shown: differing.slice(0, SHOWN_DIFFERING),
  more: Math.max(0, differing.length - SHOWN_DIFFERING),
});

/** The values the profile reads: its own where it holds one, else the app's. */
export const effectiveSettings = (
  settings: PageSettings,
  profile: ListedProfile | undefined
): PageSettings => ({ ...settings, ...profile?.overrides });

const daysText = (window: QuietWindow, locale: string) => {
  const days = new Set(quietDays(window));
  const are = (wanted: readonly number[]) =>
    days.size === wanted.length && wanted.every((day) => days.has(day));

  if (days.size === WEEK.length) {
    return t({
      message: "every day",
      comment:
        "Days of a window of quiet hours, in the Settings caption naming the value under All profiles, as in 22:00–07:00 every day",
    });
  }

  if (are([1, 2, 3, 4, 5])) {
    return t({
      message: "weekdays",
      comment:
        "Days of a window of quiet hours, Monday to Friday, in the Settings caption naming the value under All profiles, as in 22:00–07:00 weekdays",
    });
  }

  if (are([0, 6])) {
    return t({
      message: "weekends",
      comment:
        "Days of a window of quiet hours, Saturday and Sunday, in the Settings caption naming the value under All profiles, as in 22:00–07:00 weekends",
    });
  }

  return WEEK.filter((day) => days.has(day))
    .map((day) => dayName(locale, day, "short"))
    .join(", ");
};

const windowText = (window: QuietWindow, locale: string) => {
  const days = daysText(window, locale);

  if (window.start === window.end) {
    return t({
      message: `all day ${days}`,
      comment:
        "A window of quiet hours whose start and end are the same, so it holds the whole day, in the Settings caption naming the value under All profiles; {days} is when, such as every day or weekdays",
    });
  }

  const { start, end } = window;

  return t({
    message: `${start}–${end} ${days}`,
    comment:
      "A window of quiet hours in the Settings caption naming the value under All profiles; {start} and {end} are times such as 22:00 and 07:00, {days} when, such as every day or weekdays",
  });
};

/**
 * The app value as a profile's caption names it: On or Off, the sound's
 * name, or each window of quiet hours.
 */
export const appValueText = <Key extends PageOverridableKey>(
  key: Key,
  value: PageSettings[Key],
  soundNames: Readonly<Record<SoundChoice, string>>,
  locale: string
) => {
  if (key === "notificationSound") {
    return soundNames[value as SoundChoice];
  }

  if (key === "quietHours") {
    const list = value as readonly QuietWindow[];

    return list.length === 0
      ? t({
          message: "none",
          comment:
            "Quiet hours under All profiles when they have no window, in the Settings caption: For all profiles, it's none.",
        })
      : list.map((window) => windowText(window, locale)).join("; ");
  }

  return switchValueText(Boolean(value));
};

/** A switch's app value as a profile's caption names it. */
export const switchValueText = (on: boolean) =>
  on
    ? t({
        message: "On",
        comment:
          "A switch's value under All profiles in the Settings caption under a profile's own value: For all profiles, it's On.",
      })
    : t({
        message: "Off",
        comment:
          "A switch's value under All profiles in the Settings caption under a profile's own value: For all profiles, it's Off.",
      });

/** The muted line before a row's badges, counting the profiles that differ. */
export const differsText = (count: number) =>
  t({
    message: plural(count, {
      one: "Set differently for # profile:",
      other: "Set differently for # profiles:",
    }),
    comment:
      "Muted line under a setting in Settings' All profiles, before a badge naming each profile that sets its own value; # is how many",
  });
