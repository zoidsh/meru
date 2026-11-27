import { isEqual } from "es-toolkit";

import type { App } from "./apps.ts";
import { drawnTabs } from "./drawn-tabs.ts";
import { paneTabs } from "./pane-tree.ts";
import type { PaneDirection, Split } from "./pane-tree.ts";
import type { OpenAppsIn } from "./settings.ts";
import {
  isInSplit,
  splitBeside,
  splitOf,
  splitTarget,
  splitWith,
  withBoxMove,
  withMaximized,
  withoutPane,
} from "./split.ts";
import {
  GMAIL_TAB_ID,
  inOwnWindow,
  isPinned,
  isTab,
  knownTabs,
  withSplit,
} from "./state.ts";
import type { Profile, State, Tab } from "./state.ts";
import { viewDrop } from "./view-drop.ts";
import type { Rectangle, Size } from "./window-bounds.ts";

/** A tab is named by its profile and its id, which is unique only within it. */
export interface TabKey {
  profileId: string;
  tabId: string;
}

export const tabKey = ({ profileId, tabId }: TabKey) => `${profileId}/${tabId}`;

/** Whether a tab of the profile is shown in the main window. */
export const isMainWindowTab = (profile: Profile, tabId: string) =>
  knownTabs(profile).some((tab) => tab.id === tabId && !inOwnWindow(tab));

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
  /** A new tab that started in a window of its own, to bring forward. */
  ownWindow?: true;
}

/** Gmail's tab keeps its id however often it is closed and opened again. */
export const newTabId = (app: App, newId: () => string) =>
  app.id === "gmail" ? GMAIL_TAB_ID : newId();

/**
 * Whether a new tab starts in a window of its own, as Move to New Window
 * would put it: under New window, for the profile it opens in, any app but
 * Gmail, unless it is pinned or was asked for as a split.
 */
export const startsInOwnWindow = ({
  app,
  pinned,
  split,
  openAppsIn,
}: {
  app: App;
  pinned: boolean;
  split: boolean;
  openAppsIn: OpenAppsIn;
}) => openAppsIn === "windows" && app.id !== "gmail" && !pinned && !split;

/**
 * Opens `url` as a tab of `app` in the profile, selected: appended, or put
 * right after the tab `after` names, or for a single-instance app with a tab
 * already, that tab, given the URL. With `split`, it goes in a new pane that
 * way of the focused one, as Split right and Split down put it. A new tab
 * `startsInOwnWindow` sends to a window of its own leaves the main window's
 * selection as it was.
 */
export const openTab = (
  state: State,
  profileId: string,
  app: App,
  url: string,
  newId: () => string,
  after?: string,
  split?: PaneDirection,
  openAppsIn: OpenAppsIn = "tabs"
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
        // One in its own window opens the URL there.
        selectedTabId: inOwnWindow(existing)
          ? profile.selectedTabId
          : existing.id,
      };
    }

    const ownWindow = startsInOwnWindow({
      app,
      pinned: false,
      split: split !== undefined,
      openAppsIn,
    });
    const tab: Tab = {
      id: newTabId(app, newId),
      app: app.id,
      url,
      title: "",
      // Gmail with no pinned key reads as pinned, as it was before pinning.
      ...(app.id === "gmail" && { pinned: false }),
      ...(ownWindow && { ownWindow: true }),
    };

    opened = { tabId: tab.id, ...(ownWindow && { ownWindow: true }) };

    const before = profile.tabs.findIndex(
      (entry) => isTab(entry) && entry.id === after
    );
    const at = before === -1 ? profile.tabs.length : before + 1;

    return {
      ...profile,
      tabs: profile.tabs.toSpliced(at, 0, tab),
      selectedTabId: ownWindow ? profile.selectedTabId : tab.id,
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
 * Selecting a tab in a split shows that split, its pane focused. Nothing
 * when the tab is not shown or already selected.
 */
export const selectTab = (
  state: State,
  { profileId, tabId }: TabKey
): State | undefined =>
  updateProfile(state, profileId, (profile) =>
    profile.selectedTabId !== tabId && isMainWindowTab(profile, tabId)
      ? { ...profile, selectedTabId: tabId }
      : undefined
  );

/** Any tab but a pinned one, which is unpinned first. */
export const canCloseTab = (tab: Tab) => !isPinned(tab);

/**
 * The main window's tab a selection leaving `tab` goes to: the next shown
 * one in the main window, or the last before it when there is none after.
 */
const successor = (profile: Profile, tab: Tab) => {
  const shown = knownTabs(profile);
  const index = shown.indexOf(tab);
  const stays = (candidate: Tab) =>
    candidate !== tab && !inOwnWindow(candidate);

  return (
    shown.slice(index + 1).find(stays) ?? shown.slice(0, index).findLast(stays)
  );
};

/**
 * Closing the selected tab selects the shown tab to its right, or to its left
 * when it was last, as removing a profile does, and none when it was the only
 * one; in a split, the pane that takes its focus, or the one pane left. A
 * tab in its own window is passed over. A closed tab's pane gives its space
 * to those beside it. Nothing for a pinned tab or one that is not shown.
 */
export const closeTab = (
  state: State,
  { profileId, tabId }: TabKey
): State | undefined =>
  updateProfile(state, profileId, (profile) => {
    const tab = knownTabs(profile).find((candidate) => candidate.id === tabId);

    if (!tab || !canCloseTab(tab)) {
      return;
    }

    const paned = withoutPane(profile, tabId);

    return {
      ...paned.profile,
      tabs: profile.tabs.filter((candidate) => candidate !== tab),
      selectedTabId:
        profile.selectedTabId === tabId
          ? (paned.next ?? successor(profile, tab)?.id ?? "")
          : profile.selectedTabId,
    };
  });

/** A tab that is not pinned can go to a window of its own. */
export const canMoveToOwnWindow = (tab: Tab) =>
  !isPinned(tab) && !inOwnWindow(tab);

/**
 * Moves the tab to a window of its own: a tab in a split leaves it first, as
 * Separate takes it, and a selected tab's selection goes where closing it
 * would send it. Nothing for a pinned tab, one already in its own window or
 * one that is not shown.
 */
export const moveToOwnWindow = (
  state: State,
  { profileId, tabId }: TabKey
): State | undefined =>
  updateProfile(state, profileId, (profile) => {
    const tab = knownTabs(profile).find((candidate) => candidate.id === tabId);

    if (!tab || !canMoveToOwnWindow(tab)) {
      return;
    }

    const paned = withoutPane(profile, tabId);

    return {
      ...paned.profile,
      tabs: profile.tabs.map((entry) =>
        entry === tab ? { ...tab, ownWindow: true } : entry
      ),
      selectedTabId:
        profile.selectedTabId === tabId
          ? (paned.next ?? successor(profile, tab)?.id ?? "")
          : profile.selectedTabId,
    };
  });

/**
 * Puts the tab back in the main window, at its place in the sidebar, and
 * with `select` selects it and its profile. Its window's bounds are kept for
 * the next time it moves out. Nothing for a tab not in its own window.
 */
export const moveToMainWindow = (
  state: State,
  { profileId, tabId }: TabKey,
  select: boolean
): State | undefined => {
  const next = updateProfile(state, profileId, (profile) => {
    const tab = knownTabs(profile).find((candidate) => candidate.id === tabId);

    if (!tab || !inOwnWindow(tab)) {
      return;
    }

    const { ownWindow: _moved, ...back } = tab;

    return {
      ...profile,
      tabs: profile.tabs.map((entry) =>
        entry === tab ? (back as Tab) : entry
      ),
      ...(select && { selectedTabId: tabId }),
    };
  });

  return next && select ? { ...next, selectedProfileId: profileId } : next;
};

/**
 * Puts the tab in a new pane `direction` of the focused pane, or of the
 * selected tab where it is in no split, which starts one, focused and
 * selected; a tab of another split leaves it.
 */
export const splitTab = (
  state: State,
  { profileId, tabId }: TabKey,
  direction: PaneDirection
): State | undefined =>
  updateProfile(state, profileId, (profile) =>
    isMainWindowTab(profile, tabId)
      ? splitWith(profile, tabId, direction)
      : undefined
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
 * Maximize shows the tab's pane alone and keeps its split; Restore brings
 * every pane of the tab's split back. Either selects the tab, which shows
 * its split. Nothing for a tab in no split, or when it is already so.
 */
export const maximizePane = (
  state: State,
  { profileId, tabId }: TabKey,
  on: boolean
): State | undefined =>
  updateProfile(state, profileId, (profile) =>
    isInSplit(profile, tabId)
      ? withMaximized({ ...profile, selectedTabId: tabId }, on)
      : undefined
  );

/**
 * The profile's split holding the same panes as `split`, with its new
 * sizes, resized or evened out; nothing when none holds them any more, as
 * when one closed meanwhile, or when nothing changes.
 */
export const resizeSplit = (
  state: State,
  profileId: string,
  split: Split
): State | undefined =>
  updateProfile(state, profileId, (profile) => {
    const previous = splitOf(profile, paneTabs(split.root)[0] ?? "");

    return previous &&
      !isEqual(previous, split) &&
      isEqual(paneTabs(previous.root), paneTabs(split.root))
      ? withSplit(profile, previous, split)
      : undefined;
  });

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

/**
 * Marks the tab Sleep When Idle, or takes the mark away, leaving no key.
 * Nothing for a tab not shown, or one that already reads so.
 */
export const setSleepWhenIdle = (state: State, key: TabKey, on: boolean) =>
  updateTab(state, key, (tab) => {
    const { sleepWhenIdle: _sleepWhenIdle, ...rest } = tab;

    if ((tab.sleepWhenIdle === true) === on) {
      return;
    }

    return on ? { ...rest, sleepWhenIdle: true } : rest;
  });

/** Keeps where the tab's own window is. Nothing when it is there already. */
export const setOwnWindowBounds = (
  state: State,
  key: TabKey,
  bounds: Rectangle
) =>
  updateTab(state, key, (tab) =>
    isEqual(tab.windowBounds, bounds)
      ? undefined
      : { ...tab, windowBounds: bounds }
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
 * The tab `before` names as a tab moving out of its split lands before it:
 * a tab of a box stands for that box, which the sidebar draws where its
 * first pinned tab stands, else its first tab. Where that is the moving
 * tab, it stays where it is.
 */
const placeBefore = (profile: Profile, before: string | undefined) => {
  const box = before === undefined ? undefined : splitOf(profile, before);
  const boxed = new Set(box ? paneTabs(box.root) : []);
  const stored = knownTabs(profile).filter((tab) => boxed.has(tab.id));

  return (stored.find(isPinned) ?? stored[0])?.id ?? before;
};

/**
 * Moves a shown tab of the selected profile within its area, the pinned
 * tabs or the rest, to just before the tab `before` names, or after the
 * area's last tab when it names none. A tab in a split leaves it on the
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

        if (!tab) {
          return;
        }

        const place = leaving ? placeBefore(profile, before) : before;

        if (place === tabId) {
          return leaving ? withoutPane(profile, tabId).profile : undefined;
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
 * Moves a tab of a split's box that is not pinned among the box's other
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
    isMainWindowTab(profile, tabId) && isMainWindowTab(profile, target)
      ? splitBeside(profile, tabId, target, "row")
      : undefined
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
    const drop = isMainWindowTab(profile, tabId)
      ? viewDrop(profile, size, point, tabId)
      : undefined;

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
  const shown = profile
    ? drawnTabs(profile).filter((tab) => !inOwnWindow(tab))
    : [];
  const index = shown.findIndex((tab) => tab.id === profile?.selectedTabId);
  const tab = shown.at((index + offset) % shown.length);

  return profile && tab && shown.length > 1
    ? { profileId: profile.id, tabId: tab.id }
    : undefined;
};
