import { knownTabs, selectedProfile } from "./state.ts";
import type { State } from "./state.ts";
import { tabKey } from "./tabs.ts";
import type { TabKey } from "./tabs.ts";

export interface ViewPlan {
  /** The tabs that have a view, in the order of the profiles and their tabs. */
  views: TabKey[];
  /** The selected tab of the selected profile. */
  front: TabKey;
  /** Whether the front tab's view shows, which it does not under the inbox. */
  frontShown: boolean;
}

/**
 * A tab gets its view when it is first on screen and keeps it, hidden, while
 * another is, until it is closed or its profile removed. `existing` is the
 * keys of the tabs that have a view now. While the unified inbox fills the
 * content area the front tab keeps its view, hidden under it.
 */
export const planViews = (
  state: State,
  existing: readonly string[],
  { inboxOpen = false }: { inboxOpen?: boolean } = {}
): ViewPlan => {
  const profile = selectedProfile(state);
  const front = { profileId: profile.id, tabId: profile.selectedTabId };
  const frontKey = tabKey(front);

  return {
    views: state.profiles.flatMap((candidate) =>
      knownTabs(candidate)
        .map((tab) => ({ profileId: candidate.id, tabId: tab.id }))
        .filter((key) => {
          const id = tabKey(key);

          return id === frontKey || existing.includes(id);
        })
    ),
    front,
    frontShown: !inboxOpen,
  };
};
