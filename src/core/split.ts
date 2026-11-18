import { addPane, paneTabs, panesFit, removePane } from "./pane-tree.ts";
import type { PaneDirection, PaneSplit, Split } from "./pane-tree.ts";
import { knownTabs, withSplit } from "./state.ts";
import type { Profile } from "./state.ts";
import type { Size } from "./window-bounds.ts";

/** The tabs of the profile's panes in reading order; none without a split. */
export const splitTabs = (profile: Pick<Profile, "split">): string[] =>
  profile.split ? paneTabs(profile.split.root) : [];

export const isInSplit = (profile: Pick<Profile, "split">, tabId: string) =>
  splitTabs(profile).includes(tabId);

/** The profile's split while it shows, which is while its selected tab is in it. */
export const shownSplit = (
  profile: Pick<Profile, "split" | "selectedTabId">
): Split | undefined =>
  profile.split && isInSplit(profile, profile.selectedTabId)
    ? profile.split
    : undefined;

/**
 * The tab a new pane goes beside: the focused pane's while the split shows,
 * else the selected tab where the profile has no split yet. None while the
 * selected tab is outside the split, since a profile has one split.
 */
export const splitTarget = (profile: Profile): string | undefined => {
  const shown = shownSplit(profile);

  if (shown) {
    return profile.selectedTabId;
  }

  return profile.split ||
    !knownTabs(profile).some((tab) => tab.id === profile.selectedTabId)
    ? undefined
    : profile.selectedTabId;
};

const NEW_PANE = "\u0000new pane";

/**
 * Whether a pane put beside the target, `direction` of it, leaves every
 * pane at least the minimum in a page area of `size`.
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
      addPane(profile.split?.root ?? target, target, NEW_PANE, direction),
      size
    )
  );
};

/**
 * The profile with `tabId` in a new pane `direction` of `target`'s, the
 * target's by default, focused and selected. Nothing when there is no
 * target, the tab is not shown, is the target or already has a pane.
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

  return {
    ...withSplit(profile, {
      ...profile.split,
      root: addPane(
        profile.split?.root ?? target,
        target,
        tabId,
        direction
      ) as PaneSplit,
      focused: tabId,
    }),
    selectedTabId: tabId,
  };
};

/**
 * The profile without the tab's pane, whose space goes to the panes beside
 * it; a split left with one pane ends. A focused pane's focus goes to the
 * pane now in its place in reading order. With it, the tab of the one pane
 * left when the split ended.
 */
export const withoutPane = (
  profile: Profile,
  tabId: string
): { profile: Profile; alone?: string } => {
  const { split } = profile;

  if (!split || !isInSplit(profile, tabId)) {
    return { profile };
  }

  const before = paneTabs(split.root);
  const root = removePane(split.root, tabId);

  if (root === undefined || typeof root === "string") {
    return {
      profile: withSplit(profile, undefined),
      ...(root !== undefined && { alone: root }),
    };
  }

  const after = paneTabs(root);
  const focused =
    split.focused === tabId
      ? (after[Math.min(before.indexOf(tabId), after.length - 1)] ?? "")
      : split.focused;

  return { profile: withSplit(profile, { ...split, root, focused }) };
};

/** The split's focus kept on the selected tab while that is in it. */
export const focusSelected = (profile: Profile): Profile =>
  profile.split &&
  profile.split.focused !== profile.selectedTabId &&
  isInSplit(profile, profile.selectedTabId)
    ? withSplit(profile, {
        ...profile.split,
        focused: profile.selectedTabId,
      })
    : profile;
