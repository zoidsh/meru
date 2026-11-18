import { knownTabs, opensAtLaunch, selectedProfile } from "./state.ts";
import type { Profile, State } from "./state.ts";
import { tabKey } from "./tabs.ts";
import type { TabKey } from "./tabs.ts";

/**
 * Whether a profile's Open at Launch tabs open now, once a session: the
 * selected profile's, so each profile's open when it is first selected and
 * launch loads no page for the others, whose mail needs none.
 */
export const opensLaunchTabs = (profile: Profile, state: State) =>
  profile.id === state.selectedProfileId;

export interface ViewPlan {
  /** The tabs that have a view, in the order of the profiles and their tabs. */
  views: TabKey[];
  /** The selected tab of the selected profile, unless it has none. */
  front?: TabKey;
  /** Open at Launch tabs to load now, without showing them. */
  opening: TabKey[];
  /** The profiles whose Open at Launch tabs those are, opened once. */
  launched: string[];
}

/**
 * A tab gets its view when it is first on screen, or opened as its profile's
 * Open at Launch tabs are, and keeps it, hidden, while another is on screen,
 * until it is closed, put to sleep or its profile removed. `existing` is the
 * keys of the tabs that have a view now, `launched` the profiles whose Open
 * at Launch tabs were opened this session, and `sleeping` the tabs put to
 * sleep, which stay without a view even on screen.
 */
export const planViews = (
  state: State,
  existing: readonly string[],
  launched: ReadonlySet<string>,
  sleeping: ReadonlySet<string> = new Set()
): ViewPlan => {
  const profile = selectedProfile(state);
  const shown = knownTabs(profile);
  const front = shown.some((tab) => tab.id === profile.selectedTabId)
    ? { profileId: profile.id, tabId: profile.selectedTabId }
    : undefined;
  const launching = state.profiles.filter(
    (candidate) =>
      !launched.has(candidate.id) && opensLaunchTabs(candidate, state)
  );
  const opening = launching.flatMap((candidate) =>
    knownTabs(candidate)
      .filter(opensAtLaunch)
      .map((tab) => ({ profileId: candidate.id, tabId: tab.id }))
  );
  const kept = new Set(
    [
      ...existing,
      ...opening.map(tabKey),
      ...(front ? [tabKey(front)] : []),
    ].filter((key) => !sleeping.has(key))
  );

  return {
    views: state.profiles.flatMap((candidate) =>
      knownTabs(candidate)
        .map((tab) => ({ profileId: candidate.id, tabId: tab.id }))
        .filter((key) => kept.has(tabKey(key)))
    ),
    ...(front && { front }),
    opening,
    launched: launching.map((candidate) => candidate.id),
  };
};
