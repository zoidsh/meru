import { paneRectangles, paneTabs } from "./pane-tree.ts";
import type { PaneRectangle, PaneTree } from "./pane-tree.ts";
import { shownSplit } from "./split.ts";
import {
  isAsleep,
  knownTabs,
  opensAtLaunch,
  selectedProfile,
} from "./state.ts";
import type { Profile, State } from "./state.ts";
import { tabKey } from "./tabs.ts";
import type { TabKey } from "./tabs.ts";

/**
 * Where each shown tab's view sits in the page area `area`: the whole of it
 * for a tab alone, else its pane's rectangle.
 */
export const placeShown = (
  plan: Pick<ViewPlan, "shown" | "panes">,
  area: PaneRectangle["bounds"]
): PaneRectangle[] =>
  plan.panes
    ? paneRectangles(plan.panes, area)
    : plan.shown.map(({ tabId }) => ({ tabId, bounds: area }));

/**
 * Whether a profile's Open at Launch tabs open now, once a session: the
 * selected profile's, so each profile's open when it is first selected and
 * launch loads no page for the others, whose mail needs none. The selected
 * profile is never asleep, so a sleeping profile's tabs wait until it is
 * woken.
 */
export const opensLaunchTabs = (profile: Profile, state: State) =>
  profile.id === state.selectedProfileId;

export interface ViewPlan {
  /** The tabs that have a view, in the order of the profiles and their tabs. */
  views: TabKey[];
  /** The selected tab of the selected profile, unless it has none or sleeps. */
  front?: TabKey;
  /**
   * The tabs on screen: every pane's while the front tab is in its profile's
   * split, in reading order, else the front tab alone.
   */
  shown: TabKey[];
  /** The split's tree while it shows, which places the shown views. */
  panes?: PaneTree;
  /** Open at Launch tabs to load now, without showing them. */
  opening: TabKey[];
  /** The profiles whose Open at Launch tabs those are, opened once. */
  launched: string[];
}

/**
 * A tab gets its view when it is first on screen, or opened as its profile's
 * Open at Launch tabs are, and keeps it, hidden, while another is on screen,
 * until it is closed or put to sleep, or its profile is removed or put to
 * sleep: a sleeping profile has no view at all. `existing` is the keys of
 * the tabs that have a view now, `launched` the profiles whose Open
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
  const split = front && shownSplit(profile);
  const alone = front ? [front] : [];
  const onScreen: TabKey[] = split
    ? paneTabs(split.root).map((tabId) => ({ profileId: profile.id, tabId }))
    : alone;
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
    [...existing, ...opening.map(tabKey), ...onScreen.map(tabKey)].filter(
      (key) => !sleeping.has(key)
    )
  );

  return {
    views: state.profiles.flatMap((candidate) =>
      (isAsleep(state, candidate) ? [] : knownTabs(candidate))
        .map((tab) => ({ profileId: candidate.id, tabId: tab.id }))
        .filter((key) => kept.has(tabKey(key)))
    ),
    ...(front && { front }),
    shown: onScreen,
    ...(split && { panes: split.root }),
    opening,
    launched: launching.map((candidate) => candidate.id),
  };
};
