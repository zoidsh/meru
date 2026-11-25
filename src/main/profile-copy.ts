import { t } from "@lingui/core/macro";

import { DEFAULT_PROFILE_NAME } from "#core/state.ts";
import type { Profile } from "#core/state.ts";
import type { Confirmation } from "#platform/window.ts";

/** Stored as named, in the language of the day it was added. */
export const automaticProfileName = (n: number) =>
  t({
    message: `Profile ${n}`,
    comment:
      "Name given to a newly added profile, where {n} is a number from 2 up; the person can rename it later",
  });

/** The first profile's stored English name is translated as it is shown. */
export const profileDisplayName = (profile: Pick<Profile, "name">) =>
  profile.name === DEFAULT_PROFILE_NAME
    ? t({
        message: "Default",
        context: "profile name",
        comment:
          "Name of the first profile until the person renames it, shown in the title bar",
      })
    : profile.name;

export const removeProfileConfirmation = (name: string): Confirmation => ({
  message: t({
    message: `Remove ${name}?`,
    comment:
      "Question in the dialog that confirms removing a profile; {name} is the profile's name",
  }),
  detail: t({
    message:
      "You'll be signed out, and its tabs, saved searches and settings will be deleted from this computer. Your Google account isn't affected.",
    comment: "Explanation in the dialog that confirms removing a profile",
  }),
  confirmLabel: t({
    message: "Remove",
    comment: "Button in the dialog that confirms removing a profile",
  }),
  cancelLabel: t({
    message: "Cancel",
    comment:
      "Button in the dialog that confirms removing a profile, which keeps it",
  }),
});
