import { isEqual } from "es-toolkit";

import type { App } from "./apps.ts";
import { drawnTabs } from "./drawn-tabs.ts";
import { paneTabs } from "./pane-tree.ts";
import type { PaneDirection, Split } from "./pane-tree.ts";
import {
  isInSplit,
  splitBeside,
  splitTarget,
  splitWith,
  withBoxMove,
  withMaximized,
  withoutPane,
} from "./split.ts";
import {
  GMAIL_TAB_ID,
  isPinned,
  isTab,
  knownTabs,
  withSplit,
} from "./state.ts";
import type { Profile, State, Tab } from "./state.ts";
import { viewDrop } from "./view-drop.ts";
import type { Size } from "./window-bounds.ts";

/** A tab is named by its profile and its id, which is unique only within it. */
export interface TabKey {
  profileId: string;
  tabId: string;
}

export const tabKey = ({ profileId, tabId }: TabKey) => `${profileId}/${tabId}`;

const updateProfile = (
  state: State,
  profileId: string,
  update: (profile: Profile) => Profile | undefined
): State | undefined => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === profileId
  );
  const next = profile && update(profile);

  return next
    ? {
        ...state,
        profiles: state.profiles.map((candidate) =>
          candidate === profile ? next : candidate
        ),
      }
    : undefined;
};

export interface OpenedTab {
  state: State;
  tabId: string;
}

/** Gmail's tab keeps its id however often it is closed and opened again. */
export const newTabId = (app: App, newId: () => string) =>
  app.id === "gmail" ? GMAIL_TAB_ID : newId();

/**
 * Opens `url` as a tab of `app` in the profile, selected: appended, or put
 * right after the tab `after` names, or for a single-instance app with a tab
 * already, that tab, given the URL. With `split`, it goes in a new pane that
 * way of the focused one, as Split right and Split down put it.
 */
export const openTab = (
  state: State,
  profileId: string,
  app: App,
  url: string,
  newId: () => string,
  after?: string,
  split?: PaneDirection
): OpenedTab | undefined => {
  let opened: Omit<OpenedTab, "state"> | undefined;

  const openInProfile = (profile: Profile): Profile | undefined => {
    const existing = app.singleInstance
      ? knownTabs(profile).find((tab) => tab.app === app.id)
      : undefined;

    if (existing) {
      opened = { tabId: existing.id };

      return {
        ...profile,
        tabs: profile.tabs.map((tab) =>
          tab === existing ? { ...tab, url } : tab
        ),
        selectedTabId: existing.id,
      };
    }

    const tab: Tab = {
      id: newTabId(app, newId),
      app: app.id,
      url,
      title: "",
      // Gmail with no pinned key reads as pinned, as it was before pinning.
      ...(app.id === "gmail" && { pinned: false }),
    };

    opened = { tabId: tab.id };

    const before = profile.tabs.findIndex(
      (entry) => isTab(entry) && entry.id === after
    );
    const at = before === -1 ? profile.tabs.length : before + 1;

    return {
      ...profile,
      tabs: profile.tabs.toSpliced(at, 0, tab),
      selectedTabId: tab.id,
    };
  };

  const next = updateProfile(state, profileId, (profile) => {
    const target = split && splitTarget(profile);
    const opening = openInProfile(profile);

    return split && opening && opened
      ? (splitWith(opening, opened.tabId, split, target) ?? opening)
      : opening;
  });

  return next && opened ? { state: next, ...opened } : undefined;
};

/**
 * Selecting a tab in the split focuses its pane. Nothing when the tab is not
 * shown or already selected.
 */
export const selectTab = (
  state: State,
  { profileId, tabId }: TabKey
): State | undefined =>
  updateProfile(state, profileId, (profile) =>
    profile.selectedTabId !== tabId &&
    knownTabs(profile).some((tab) => tab.id === tabId)
      ? { ...profile, selectedTabId: tabId }
      : undefined
  );

/** Any tab but a pinned one, which is unpinned first. */
export const canCloseTab = (tab: Tab) => !isPinned(tab);

/**
 * Closing the selected tab selects the shown tab to its right, or to its left
 * when it was last, as removing a profile does, and none when it was the only
 * one; in a split, the pane that takes its focus, or the one pane left. A
 * closed tab's pane gives its space to those beside it. Nothing for a pinned
 * tab or one that is not shown.
 */
export const closeTab = (
  state: State,
  { profileId, tabId }: TabKey
): State | undefined =>
  updateProfile(state, profileId, (profile) => {
    const shown = knownTabs(profile);
    const index = shown.findIndex((tab) => tab.id === tabId);
    const tab = shown[index];

    if (!tab || !canCloseTab(tab)) {
      return;
    }

    const left = shown.filter((candidate) => candidate !== tab);
    const neighbour = left[Math.min(index, left.length - 1)];
    const paned = withoutPane(profile, tabId);

    return {
      ...paned.profile,
      tabs: profile.tabs.filter((candidate) => candidate !== tab),
      selectedTabId:
        profile.selectedTabId === tabId
          ? (paned.next ?? neighbour?.id ?? "")
          : profile.selectedTabId,
    };
  });

/**
 * Puts the tab in a new pane `direction` of the focused pane, or of the
 * selected tab where the profile has no split, focused and selected.
 */
export const splitTab = (
  state: State,
  { profileId, tabId }: TabKey,
  direction: PaneDirection
): State | undefined =>
  updateProfile(state, profileId, (profile) =>
    splitWith(profile, tabId, direction)
  );

/**
 * Takes the tab out of its split, its space going to the panes beside it; a
 * split left with one pane ends. The tab stays selected and shows alone.
 */
export const separateTab = (
  state: State,
  { profileId, tabId }: TabKey
): State | undefined =>
  updateProfile(state, profileId, (profile) =>
    isInSplit(profile, tabId) ? withoutPane(profile, tabId).profile : undefined
  );

/**
 * Maximize shows the tab's pane alone, selecting it, and keeps the split;
 * Restore brings every pane back and selects nothing. Nothing for a tab
 * outside the split, or when it is already so.
 */
export const maximizePane = (
  state: State,
  { profileId, tabId }: TabKey,
  on: boolean
): State | undefined =>
  updateProfile(state, profileId, (profile) =>
    isInSplit(profile, tabId)
      ? withMaximized(on ? { ...profile, selectedTabId: tabId } : profile, on)
      : undefined
  );

/**
 * The profile's split with new sizes, resized or evened out; nothing when it
 * no longer holds the same panes, as when one closed meanwhile, or when
 * nothing changes.
 */
export const resizeSplit = (
  state: State,
  profileId: string,
  split: Split
): State | undefined =>
  updateProfile(state, profileId, (profile) =>
    profile.split &&
    !isEqual(profile.split, split) &&
    isEqual(paneTabs(profile.split.root), paneTabs(split.root))
      ? withSplit(profile, split)
      : undefined
  );

const updateTab = (
  state: State,
  { profileId, tabId }: TabKey,
  update: (tab: Tab) => Tab | undefined
): State | undefined =>
  updateProfile(state, profileId, (profile) => {
    const tab = knownTabs(profile).find((candidate) => candidate.id === tabId);
    const next = tab && update(tab);

    return next
      ? {
          ...profile,
          tabs: profile.tabs.map((entry) => (entry === tab ? next : entry)),
        }
      : undefined;
  });

/**
 * Pins the tab or unpins it; its Open at Launch stays as it is. Nothing when
 * it already reads so or is not shown.
 */
export const setPinned = (state: State, key: TabKey, pinned: boolean) =>
  updateTab(state, key, (tab) =>
    isPinned(tab) === pinned ? undefined : { ...tab, pinned }
  );

/** Nothing for a tab that is not pinned or not shown, or already reads so. */
export const setOpenAtLaunch = (state: State, key: TabKey, on: boolean) =>
  updateTab(state, key, (tab) =>
    !isPinned(tab) || (tab.openAtLaunch === true) === on
      ? undefined
      : { ...tab, openAtLaunch: on }
  );

export type PageUpdate = TabKey & Partial<Pick<Tab, "url" | "title">>;

/** Where each tab's page is now. Nothing when none of it is news. */
export const updatePages = (
  state: State,
  updates: readonly PageUpdate[]
): State | undefined => {
  let changed = false;

  const profiles = state.profiles.map((profile) => {
    const mine = updates.filter((update) => update.profileId === profile.id);

    if (mine.length === 0) {
      return profile;
    }

    return {
      ...profile,
      tabs: profile.tabs.map((tab) => {
        if (!isTab(tab)) {
          return tab;
        }

        const next = { ...tab };

        for (const { tabId, url, title } of mine) {
          if (tabId === tab.id) {
            next.url = url ?? next.url;
            next.title = title ?? next.title;
          }
        }

        if (next.url !== tab.url || next.title !== tab.title) {
          changed = true;

          return next;
        }

        return tab;
      }),
    };
  });

  return changed ? { ...state, profiles } : undefined;
};

/**
 * The tab `before` names as a tab moving out of the split lands before it:
 * a tab of the box stands for the box, which the sidebar draws where its
 * first stored tab other than the moving one stands.
 */
const placeBefore = (
  profile: Profile,
  tabId: string,
  before: string | undefined
) =>
  before !== undefined && isInSplit(profile, before)
    ? (knownTabs(profile).find(
        (tab) => tab.id !== tabId && isInSplit(profile, tab.id)
      )?.id ?? before)
    : before;

/**
 * Moves a shown tab of the selected profile within its area, the pinned
 * tabs or the rest, to just before the tab `before` names, or after the
 * area's last tab when it names none. A tab in the split leaves it on the
 * way, its space going to the panes beside it, and lands before the box
 * where `before` is a tab of the box. Every other entry, those not shown
 * included, keeps its place among its neighbours. Nothing across areas, for
 * a tab that is not shown, or for a move that changes nothing.
 */
export const moveTab = (
  state: State,
  { profileId, tabId }: TabKey,
  before?: string
): State | undefined =>
  profileId === state.selectedProfileId
    ? updateProfile(state, profileId, (profile) => {
        const shown = knownTabs(profile);
        const tab = shown.find((candidate) => candidate.id === tabId);
        const leaving = isInSplit(profile, tabId);
        const place = leaving ? placeBefore(profile, tabId, before) : before;

        if (!tab || place === tabId) {
          return;
        }

        const area = shown.filter(
          (candidate) => isPinned(candidate) === isPinned(tab)
        );
        const target =
          place === undefined
            ? undefined
            : area.find((candidate) => candidate.id === place);

        if (place !== undefined && !target) {
          return;
        }

        const base = leaving ? withoutPane(profile, tabId).profile : profile;
        const rest = base.tabs.filter((entry) => entry !== tab);
        // An area of this tab alone has no other to follow; the order check
        // below then finds nothing changed.
        const last = area.findLast((candidate) => candidate !== tab) ?? tab;
        const at = target ? rest.indexOf(target) : rest.indexOf(last) + 1;
        const tabs = rest.toSpliced(at, 0, tab);
        const order = tabs.filter((entry) => area.includes(entry as Tab));

        if (order.every((entry, index) => entry === area[index])) {
          return leaving ? base : undefined;
        }

        return { ...base, tabs };
      })
    : undefined;

/**
 * Moves a tab of the split's box that is not pinned among the box's other
 * such tabs, to just before `before` or after the last, its pane with it.
 */
export const moveInBox = (
  state: State,
  { profileId, tabId }: TabKey,
  before?: string
): State | undefined =>
  updateProfile(state, profileId, (profile) =>
    withBoxMove(profile, tabId, before)
  );

/**
 * A tab dropped onto another in the sidebar: in a new pane right of the
 * other's, selected, starting a split where there is none.
 */
export const splitOntoTab = (
  state: State,
  { profileId, tabId }: TabKey,
  target: string
): State | undefined =>
  updateProfile(state, profileId, (profile) =>
    splitBeside(profile, tabId, target, "row")
  );

/**
 * A tab dropped over the page area of `size` at `point`, as `viewDrop`
 * says; nothing where it lands nothing or leaves no room.
 */
export const dropInView = (
  state: State,
  { profileId, tabId }: TabKey,
  size: Size,
  point: { x: number; y: number }
): State | undefined =>
  updateProfile(state, profileId, (profile) => {
    const drop = viewDrop(profile, size, point, tabId);

    return drop?.fits ? drop.next : undefined;
  });

export const findTab = (state: State, { profileId, tabId }: TabKey) => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === profileId
  );

  return profile && knownTabs(profile).find((tab) => tab.id === tabId);
};

/**
 * The selected profile's shown tab `offset` places from its selected one in
 * the order the sidebar draws them, wrapping round as v3 does; nothing when
 * it has only the one tab.
 */
export const adjacentTab = (
  state: State,
  offset: number
): TabKey | undefined => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === state.selectedProfileId
  );
  const shown = profile ? drawnTabs(profile) : [];
  const index = shown.findIndex((tab) => tab.id === profile?.selectedTabId);
  const tab = shown.at((index + offset) % shown.length);

  return profile && tab && shown.length > 1
    ? { profileId: profile.id, tabId: tab.id }
    : undefined;
};
