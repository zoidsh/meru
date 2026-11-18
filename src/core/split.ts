import {
  PANE_GAP,
  PANE_MINIMUM,
  addAlongEdge,
  addPane,
  evenOut,
  paneHandles,
  paneTabs,
  panesFit,
  partingShare,
  removePane,
  renamePanes,
  resizePanes,
  withPartingShare,
} from "./pane-tree.ts";
import type {
  PaneDirection,
  PaneGapEnd,
  PaneSplit,
  PaneTree,
  Split,
} from "./pane-tree.ts";
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

/** Whether the focused pane shows alone, the split kept. */
export const isMaximized = (profile: Pick<Profile, "split">) =>
  profile.split?.maximized === true;

/** The split without its Maximize, which any change to it ends. */
const restored = ({ maximized: _maximized, ...split }: Split): Split => split;

/**
 * The split's panes while the selected tab is in it, the focused one being
 * the selected tab's: the stored tree without the panes of tabs this build
 * does not show, which stay stored for a build that does. None when fewer
 * than two are left. Maximized or not.
 */
export const splitPanes = (
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

/** The panes on screen: the split's, unless the focused one shows alone. */
export const shownPanes = (
  profile: Pick<Profile, "split" | "selectedTabId" | "tabs">
): PaneTree | undefined =>
  isMaximized(profile) ? undefined : splitPanes(profile);

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
      addPane(splitPanes(profile) ?? target, target, NEW_PANE, direction),
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
    ...(profile.split && restored(profile.split)),
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
        : withSplit(profile, { ...restored(split), root }),
    ...(next !== undefined && { next }),
  };
};

/**
 * The profile's split with the focused pane shown alone, or all its panes
 * again, whichever tab is selected; nothing while the selected tab's pane is
 * not on screen to maximize, or when it is already so.
 */
export const withMaximized = (
  profile: Profile,
  on: boolean
): Profile | undefined => {
  const { split } = profile;

  if (!split || isMaximized(profile) === on || (on && !splitPanes(profile))) {
    return undefined;
  }

  return withSplit(
    profile,
    on ? { ...split, maximized: true } : restored(split)
  );
};

/**
 * `base`, a split of the profile's, with the gap between the panes of
 * `before` and `after` moved `by` pixels as it shows in a page area of
 * `area`, as far as each side's minimum lets it; nothing when it does not
 * show or has no such gap. The share the move gives each side is carried to
 * the stored tree, whose panes of tabs not shown keep theirs.
 */
export const resizedSplit = (
  profile: Profile,
  base: Split,
  area: Size,
  before: string,
  after: string,
  by: number
): Split | undefined => {
  const shown = splitPanes({ ...profile, split: base });
  const resized =
    shown === undefined
      ? undefined
      : resizePanes(shown, area, before, after, by);
  const share =
    resized === undefined ? undefined : partingShare(resized, before, after);

  if (share === undefined) {
    return undefined;
  }

  // A gap left where it was stores nothing.
  return resized === shown
    ? base
    : {
        ...base,
        root: withPartingShare(base.root, before, after, share) as PaneSplit,
      };
};

/**
 * How far the gap between the panes of `before` and `after` moves to take
 * the length before it to its least or most, as `split` shows in a page area
 * of `area`; nothing when it does not show or has no such gap.
 */
export const gapTravel = (
  profile: Profile,
  split: Split,
  area: Size,
  before: string,
  after: string,
  to: PaneGapEnd
): number | undefined => {
  const shown = splitPanes({ ...profile, split });
  const handle =
    shown === undefined
      ? undefined
      : paneHandles(shown, { x: 0, y: 0, ...area }).find(
          (candidate) =>
            candidate.before === before && candidate.after === after
        );

  return handle && handle[to] - handle.size;
};

/** The split where the panes of `before` and `after` part, evened out. */
export const evenedSplit = (
  split: Split,
  before: string,
  after: string
): Split => ({
  ...split,
  root: evenOut(split.root, before, after) as PaneSplit,
});

/**
 * The profile with `tabId` in a new pane `direction` of `target`'s, before
 * it with `first`, and selected, which focuses it; a tab with a pane already
 * leaves it first, its space going to the panes beside it. Nothing for a tab
 * put beside itself, a tab or target not shown, or a target outside the
 * split while there is one, since a profile has one split.
 */
export const splitBeside = (
  profile: Profile,
  tabId: string,
  target: string,
  direction: PaneDirection,
  first = false
): Profile | undefined => {
  const shown = new Set(knownTabs(profile).map((tab) => tab.id));

  if (
    tabId === target ||
    !shown.has(tabId) ||
    !shown.has(target) ||
    (profile.split && !isInSplit(profile, target))
  ) {
    return undefined;
  }

  const base = profile.split
    ? (removePane(profile.split.root, tabId) ?? target)
    : target;
  const root = addPane(base, target, tabId, direction, first);

  return typeof root === "string"
    ? undefined
    : {
        ...withSplit(profile, {
          ...(profile.split && restored(profile.split)),
          root,
        }),
        selectedTabId: tabId,
      };
};

/**
 * The profile with `tabId` in a new pane along one edge of everything on
 * screen, `direction` of it and first or last, selected: `least` of
 * `length`, the page area's along that way, a third unless given, or as
 * much as a pane's minimum takes where that is less. A maximized split is
 * restored beside it. A tab with a pane already leaves it first.
 * Nothing for a tab not shown, nothing else on screen to sit beside, or a
 * tab shown alone while a split it is not in exists, since a profile has
 * one split.
 */
export const splitAlongEdge = (
  profile: Profile,
  tabId: string,
  direction: PaneDirection,
  first: boolean,
  length: number,
  least = 1 / 3
): Profile | undefined => {
  const shown = new Set(knownTabs(profile).map((tab) => tab.id));
  const { split, selectedTabId } = profile;

  if (
    !shown.has(tabId) ||
    !shown.has(selectedTabId) ||
    (split && !isInSplit(profile, selectedTabId))
  ) {
    return undefined;
  }

  const base = split ? removePane(split.root, tabId) : selectedTabId;

  if (base === undefined || base === tabId) {
    return undefined;
  }

  // The gaps along the edge's way once the new pane joins: a split the same
  // way takes it in among its children.
  const gaps =
    typeof base !== "string" && base.direction === direction
      ? base.children.length
      : 1;
  const share = Math.max(
    least,
    (PANE_MINIMUM + 1) / Math.max(1, length - gaps * PANE_GAP)
  );
  // Under the minimum anyway where it takes nearly all, which the fit refuses.
  const root = addAlongEdge(
    base,
    tabId,
    direction,
    first,
    Math.min(share, 0.9)
  );

  return typeof root === "string"
    ? undefined
    : {
        ...withSplit(profile, { ...(split && restored(split)), root }),
        selectedTabId: tabId,
      };
};

/**
 * Whether every pane of the profile's split, as it shows with the selected
 * tab's pane focused, is at least the minimum each way in a page area of
 * `size`; with no split on screen there is nothing to fit.
 */
export const splitRoomy = (
  profile: Pick<Profile, "split" | "selectedTabId" | "tabs">,
  size: Size
) => {
  const panes = splitPanes(profile);

  return panes === undefined || panesFit(panes, size);
};

/**
 * The profile with `tabId`, a tab of the split's box that is not pinned,
 * moved among those tabs to just before `before`, or after the last, and
 * its pane with it: those tabs' panes take them in their new order, so the
 * splits and their sizes stay. Nothing for a pinned tab, which keeps its
 * place, or a move that changes nothing.
 */
export const withBoxMove = (
  profile: Profile,
  tabId: string,
  before?: string
): Profile | undefined => {
  const { split } = profile;
  const box = boxOrder(profile) ?? [];
  const pinned = new Set(
    knownTabs(profile)
      .filter((tab) => isPinned(tab))
      .map((tab) => tab.id)
  );
  const rows = box.filter((each) => !pinned.has(each));

  if (
    !split ||
    !rows.includes(tabId) ||
    before === tabId ||
    (before !== undefined && !rows.includes(before))
  ) {
    return undefined;
  }

  const rest = rows.filter((each) => each !== tabId);
  const order = rest.toSpliced(
    before === undefined ? rest.length : rest.indexOf(before),
    0,
    tabId
  );

  if (order.every((each, index) => each === rows[index])) {
    return undefined;
  }

  const renamed = new Map(rows.map((each, index) => [each, order[index]]));

  return withSplit(profile, {
    ...restored(split),
    root: renamePanes(
      split.root,
      (each) => renamed.get(each) ?? each
    ) as PaneSplit,
  });
};
