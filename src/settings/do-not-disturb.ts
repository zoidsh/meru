import { t } from "@lingui/core/macro";

import type { SettingsState } from "#contract/settings.ts";

/**
 * Until tomorrow ends at a local midnight, which a duration from the moment it
 * was turned on, to the millisecond, all but never does.
 */
const isMidnight = (time: number) => {
  const date = new Date(time);

  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
};

/**
 * What the Do Not Disturb row says: off, what it holds and where the timed
 * choices are; on, when it ends first, as the titlebar names the end. With
 * scopes it says it holds whatever a profile sets.
 */
export const doNotDisturbCaption = (
  { on, until }: SettingsState["doNotDisturb"],
  locale: string,
  scoped = false
) => {
  const holds = scoped
    ? t({
        message: "Holds every notification, whatever a profile sets.",
        comment:
          "What the Do Not Disturb switch in Settings does, with more than one profile",
      })
    : t({
        message: "Holds every notification.",
        comment: "What the Do Not Disturb switch in Settings does",
      });

  if (!on) {
    return t({
      message: `${holds} The moon in the titlebar turns it on for a set time.`,
      comment:
        "Description of the Do Not Disturb switch in Settings while it is off; {holds} is what it does, such as Holds every notification. The moon is the Do Not Disturb button in the main window's title bar",
    });
  }

  if (until === null) {
    return t({
      message: `On until you turn it off. ${holds}`,
      comment:
        "Description of the Do Not Disturb switch in Settings while it is on with no end; {holds} is what it does, such as Holds every notification.",
    });
  }

  if (isMidnight(until)) {
    return t({
      message: `On until tomorrow. ${holds}`,
      comment:
        "Description of the Do Not Disturb switch in Settings while it is on until midnight; {holds} is what it does, such as Holds every notification.",
    });
  }

  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(until);

  return t({
    message: `On until ${time}. ${holds}`,
    comment:
      "Description of the Do Not Disturb switch in Settings while it is on for a time; {time} is the time of day it ends, such as 14:30, and {holds} what it does, such as Holds every notification.",
  });
};
