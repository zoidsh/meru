import { enabledProfiles, knownTabs } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";

export interface ShowGmailDeps {
  state: () => State;
  /** Sends the profile's Gmail tab to `url`, selected there. */
  openInGmailTab: (profileId: string, url: string) => Promise<unknown>;
  selectTab: (key: TabKey) => Promise<unknown>;
  selectProfile: (profileId: string) => Promise<unknown>;
  /** Puts the tab back in place of the unified inbox, if it is open. */
  closeInbox: () => void;
  /** Gmail's home, or the suite's stand-in's, where a closed Gmail opens. */
  home: string;
  log: (message: string) => void;
}

/**
 * How main shows a profile's Gmail when asked from outside its page, by a
 * notification's click, an inbox row, the tray's profile item, the Mail
 * menu or Sign in: each ends with the inbox closed, since what was asked for
 * is what is selected, even when it was selected already.
 */
export const createShowGmail = ({
  state,
  openInGmailTab,
  selectTab,
  selectProfile,
  closeInbox,
  home,
  log,
}: ShowGmailDeps) => {
  const isListed = (profileId: string) =>
    enabledProfiles(state()).some((profile) => profile.id === profileId);

  return {
    /**
     * Shows `url` in the profile's Gmail tab and selects the profile; false
     * when the profile is gone or was not selected.
     */
    openMessage: async (profileId: string, url: string) => {
      await openInGmailTab(profileId, url);

      try {
        await selectProfile(profileId);
      } catch (error) {
        log(`A message's profile was not selected: ${String(error)}`);

        return false;
      }

      if (!isListed(profileId)) {
        return false;
      }

      closeInbox();

      return true;
    },
    /**
     * Selects the profile's Gmail tab, or opens Gmail at its home where it
     * was closed, and then the profile, in that order so no view is made for
     * the tab it had selected.
     */
    jumpTo: async (profileId: string) => {
      const profile = state().profiles.find(
        (candidate) => candidate.id === profileId
      );
      const gmailTab =
        profile && knownTabs(profile).find((tab) => tab.app === "gmail");

      if (gmailTab) {
        await selectTab({ profileId, tabId: gmailTab.id });
      } else if (profile) {
        await openInGmailTab(profileId, home);
      }

      await selectProfile(profileId);

      if (isListed(profileId)) {
        closeInbox();
      }
    },
  };
};
