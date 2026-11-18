import { addPane, paneTabs, panesFit, removePane } from "./pane-tree.ts";
import type { PaneDirection, PaneSplit, PaneTree, Split } from "./pane-tree.ts";
import { isPinned, knownTabs, withSplit } from "./state.ts";
import type { Profile } from "./state.ts";
import type { Size } from "./window-bounds.ts";

/**
 * The tabs of the profile's panes in reading order, a pane kept for a tab
 * this build does not show among them; none without a split.
 */
export const splitTabs = (profile: Pick<Profile, "split">): string[] =>
  profile.split ? paneTabs(profile.split.root) : [];

export const isInSplit = (profile: Pick<Profile, "split">, tabId: string) =>
  splitTabs(profile).includes(tabId);

/**
 * The panes on screen while the selected tab is in the split, the focused
 * one being the selected tab's: the stored tree without the panes of tabs
 * this build does not show, which stay stored for a build that does. None
 * when fewer than two are left.
 */
export const shownPanes = (
  profile: Pick<Profile, "split" | "selectedTabId" | "tabs">
): PaneTree | undefined => {
  if (!profile.split || !isInSplit(profile, profile.selectedTabId)) {
    return undefined;
  }

  const known = new Set(knownTabs(profile).map((tab) => tab.id));
  let shown: PaneTree | undefined = profile.split.root;

  for (const tabId of splitTabs(profile)) {
    if (shown && !known.has(tabId)) {
      shown = removePane(shown, tabId);
    }
  }

  return typeof shown === "string" ? undefined : shown;
};

/**
 * The tabs of the split's box in the sidebar, in the box's order: its pinned
 * tabs first, in their order among the pinned, then the others in their
 * panes' reading order. None while fewer than two of its tabs are shown,
 * when there is no split to show.
 */
export const boxOrder = (
  profile: Pick<Profile, "split" | "tabs">
): string[] | undefined => {
  const known = knownTabs(profile);
  const shown = new Set(known.map((tab) => tab.id));
  const reading = splitTabs(profile).filter((tabId) => shown.has(tabId));

  if (reading.length < 2) {
    return undefined;
  }

  const pinned = known
    .filter((tab) => isPinned(tab) && reading.includes(tab.id))
    .map((tab) => tab.id);

  return [...pinned, ...reading.filter((tabId) => !pinned.includes(tabId))];
};

/**
 * The tab a new pane goes beside: the selected tab, which is the focused
 * pane's while the split shows, or which starts one where the profile has
 * none. None while the selected tab is outside the split, since a profile
 * has one split.
 */
export const splitTarget = (profile: Profile): string | undefined =>
  knownTabs(profile).some((tab) => tab.id === profile.selectedTabId) &&
  (!profile.split || isInSplit(profile, profile.selectedTabId))
    ? profile.selectedTabId
    : undefined;

const NEW_PANE = "\u0000new pane";

/**
 * Whether a pane put beside the target, `direction` of it, leaves every
 * pane on screen at least the minimum in a page area of `size`.
 */
export const splitFits = (
  profile: Profile,
  direction: PaneDirection,
  size: Size
) => {
  const target = splitTarget(profile);

  return (
    target !== undefined &&
    panesFit(
      addPane(shownPanes(profile) ?? target, target, NEW_PANE, direction),
      size
    )
  );
};

/**
 * The profile with `tabId` in a new pane `direction` of `target`'s, the
 * selected tab's by default, and selected, which focuses it. Nothing when
 * there is no target, the tab is not shown, is the target or already has a
 * pane.
 */
export const splitWith = (
  profile: Profile,
  tabId: string,
  direction: PaneDirection,
  target = splitTarget(profile)
): Profile | undefined => {
  if (
    target === undefined ||
    target === tabId ||
    isInSplit(profile, tabId) ||
    !knownTabs(profile).some((tab) => tab.id === tabId)
  ) {
    return undefined;
  }

  const split: Split = {
    ...profile.split,
    root: addPane(
      profile.split?.root ?? target,
      target,
      tabId,
      direction
    ) as PaneSplit,
  };

  return { ...withSplit(profile, split), selectedTabId: tabId };
};

/**
 * The profile without the tab's pane, whose space goes to the panes beside
 * it; a split left with one pane ends. With it, the tab of the pane now in
 * its place in reading order, or of the one pane left, which takes the
 * selection when the closed tab had it.
 */
export const withoutPane = (
  profile: Profile,
  tabId: string
): { profile: Profile; next?: string } => {
  const { split } = profile;

  if (!split || !isInSplit(profile, tabId)) {
    return { profile };
  }

  const known = new Set(knownTabs(profile).map((tab) => tab.id));
  const before = paneTabs(split.root).filter((each) => known.has(each));
  const root = removePane(split.root, tabId);
  const after = (root === undefined ? [] : paneTabs(root)).filter((each) =>
    known.has(each)
  );
  const next = after[Math.min(before.indexOf(tabId), after.length - 1)];

  return {
    profile:
      root === undefined || typeof root === "string"
        ? withSplit(profile, undefined)
        : withSplit(profile, { ...split, root }),
    ...(next !== undefined && { next }),
  };
};
