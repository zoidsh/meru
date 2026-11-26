import { t } from "@lingui/core/macro";

import type { SettingsState } from "#contract/settings.ts";
import { endsTomorrow } from "#core/notification-gate.ts";

/**
 * What the Do Not Disturb row says: off, what it does and where the timed
 * choices are; on, when it ends first, as the title bar names the end.
 */
export const doNotDisturbCaption = (
  { on, until }: SettingsState["doNotDisturb"],
  locale: string,
  now: number
) => {
  const holds = t({
    message: "Silences all notifications.",
    comment: "What the Do Not Disturb switch in Settings does",
  });

  if (!on) {
    return t({
      message: `${holds} You can also turn it on for a while from the moon in the title bar.`,
      comment:
        "Description of the Do Not Disturb switch in Settings while it is off; {holds} is what it does, such as Silences all notifications. The moon is the Do Not Disturb button in the main window's title bar",
    });
  }

  if (until === null) {
    return t({
      message: `On until you turn it off. ${holds}`,
      comment:
        "Description of the Do Not Disturb switch in Settings while it is on with no end; {holds} is what it does, such as Silences all notifications.",
    });
  }

  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(until);

  if (endsTomorrow(until, now)) {
    return t({
      message: `On until tomorrow, ${time}. ${holds}`,
      comment:
        "Description of the Do Not Disturb switch in Settings while it is on until a time tomorrow; {time} is the time of day it ends, such as 8:00, and {holds} what it does, such as Silences all notifications.",
    });
  }

  return t({
    message: `On until ${time}. ${holds}`,
    comment:
      "Description of the Do Not Disturb switch in Settings while it is on for a time; {time} is the time of day it ends, such as 14:30, and {holds} what it does, such as Silences all notifications.",
  });
};
