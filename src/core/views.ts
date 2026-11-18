import { paneRectangles, paneTabs } from "./pane-tree.ts";
import type { PaneRectangle, PaneTree } from "./pane-tree.ts";
import { shownPanes } from "./split.ts";
import {
  inOwnWindow,
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
 * The profile whose Open at Launch tabs open now, once a session: the
 * selected profile's first, as soon as it has not had them, then each other
 * awake profile's in order, one profile at a time, while no other's are
 * still loading (`waiting`), so a launch with many profiles does not load
 * every page at once. A sleeping profile's tabs wait until it is woken.
 */
export const nextLaunch = (
  state: State,
  launched: ReadonlySet<string>,
  waiting: boolean
): Profile | undefined => {
  const due = (profile: Profile) =>
    !launched.has(profile.id) && !isAsleep(state, profile);
  const selected = selectedProfile(state);

  if (due(selected)) {
    return selected;
  }

  return waiting ? undefined : state.profiles.find(due);
};

export interface ViewPlan {
  /** The tabs that have a view, in the order of the profiles and their tabs. */
  views: TabKey[];
  /**
   * The selected tab of the selected profile, unless it has none or sleeps;
   * never a tab in its own window.
   */
  front?: TabKey;
  /**
   * The tabs on screen: every pane's while the front tab is in its profile's
   * split, in reading order, else the front tab alone.
   */
  shown: TabKey[];
  /** The split's tree while it shows, which places the shown views. */
  panes?: PaneTree;
  /**
   * The tabs in windows of their own, each its window's one page, which
   * never sleep: every one of an awake profile whose Open at Launch tabs
   * have opened, as they open with them.
   */
  windows: TabKey[];
  /** Open at Launch tabs to load now, without showing them. */
  opening: TabKey[];
  /** The profile whose Open at Launch tabs those are, opened once. */
  launched: string[];
}

/**
 * A tab gets its view when it is first on screen, or opened as its profile's
 * Open at Launch tabs are, and keeps it, hidden, while another is on screen,
 * until it is closed or put to sleep, or its profile is removed or put to
 * sleep: a sleeping profile has no view at all. `existing` is the keys of
 * the tabs that have a view now, `launched` the profiles whose Open
 * at Launch tabs were opened this session, `sleeping` the tabs put to
 * sleep, which stay without a view even on screen, and `waiting` whether
 * Open at Launch tabs opened before are still loading.
 */
export const planViews = (
  state: State,
  existing: readonly string[],
  launched: ReadonlySet<string>,
  sleeping: ReadonlySet<string> = new Set(),
  waiting = false
): ViewPlan => {
  const profile = selectedProfile(state);
  const shown = knownTabs(profile);
  const front = shown.some(
    (tab) => tab.id === profile.selectedTabId && !inOwnWindow(tab)
  )
    ? { profileId: profile.id, tabId: profile.selectedTabId }
    : undefined;
  const panes = front && shownPanes(profile);
  const alone = front ? [front] : [];
  const onScreen: TabKey[] = panes
    ? paneTabs(panes).map((tabId) => ({ profileId: profile.id, tabId }))
    : alone;
  const next = nextLaunch(state, launched, waiting);
  const launching = next ? [next] : [];
  const opening = launching.flatMap((candidate) =>
    knownTabs(candidate)
      .filter(opensAtLaunch)
      .map((tab) => ({ profileId: candidate.id, tabId: tab.id }))
  );
  const opensNow = new Set(launching.map((candidate) => candidate.id));
  const windows = state.profiles.flatMap((candidate) =>
    !isAsleep(state, candidate) &&
    (launched.has(candidate.id) || opensNow.has(candidate.id))
      ? knownTabs(candidate)
          .filter(inOwnWindow)
          .map((tab) => ({ profileId: candidate.id, tabId: tab.id }))
      : []
  );
  const kept = new Set([
    ...[...existing, ...opening.map(tabKey), ...onScreen.map(tabKey)].filter(
      (key) => !sleeping.has(key)
    ),
    ...windows.map(tabKey),
  ]);

  return {
    views: state.profiles.flatMap((candidate) =>
      (isAsleep(state, candidate) ? [] : knownTabs(candidate))
        .map((tab) => ({ profileId: candidate.id, tabId: tab.id }))
        .filter((key) => kept.has(tabKey(key)))
    ),
    ...(front && { front }),
    shown: onScreen,
    ...(panes && { panes }),
    windows,
    opening,
    launched: launching.map((candidate) => candidate.id),
  };
};
