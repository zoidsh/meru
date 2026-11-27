import { noop } from "es-toolkit";

import { profileColor } from "#core/profile-color.ts";
import { windowBackground } from "#core/shell-grey.ts";
import type { TabKey } from "#core/tabs.ts";
import type { Theme } from "#platform/theme.ts";

import type { Profiles } from "../profiles.ts";
import type { SettingsStore } from "../settings.ts";
import type { TrialChoice } from "../shell-pro.ts";

/**
 * The colour each window of the shell's is given, the frame it draws, so its
 * first frame and a resize's edge show nothing else: the selected profile's
 * tonal shell for the main window, a tab's profile's for its own window, the
 * grey with the tint off and on the trial-ended screen, which no profile
 * tints.
 */
export const wireFrameColors = ({
  theme,
  settings,
  profiles,
  trialChoice,
}: {
  theme: Pick<Theme, "isDark" | "onChange">;
  settings: Pick<SettingsStore, "get" | "onChange">;
  profiles: Pick<Profiles, "get" | "onChange">;
  trialChoice: Pick<TrialChoice, "waiting" | "chosen">;
}) => {
  const tintOf = (profileId: string) =>
    settings.get("profileTint")
      ? profileColor(profiles.get(), profileId)
      : undefined;

  return {
    mainWindow: () =>
      windowBackground(
        theme.isDark(),
        trialChoice.waiting()
          ? undefined
          : tintOf(profiles.get().selectedProfileId)
      ),
    ownWindow: (key: TabKey) =>
      windowBackground(theme.isDark(), tintOf(key.profileId)),
    /** Told whenever a colour may have changed; the windows set only what did. */
    onChange: (listener: () => void) => {
      theme.onChange(listener);
      settings.onChange("profileTint", listener);
      profiles.onChange(listener);
      trialChoice.chosen.then(listener).catch(noop);
    },
  };
};
