import type { Ids } from "../ports.ts";
import type { App } from "../records/app.ts";
import type { Group } from "../records/group.ts";
import type { Orientation } from "../records/layout.ts";
import { colorFor } from "../records/profile.ts";
import type { Profile, ProfileStatus } from "../records/profile.ts";
import type { ProfilesState } from "../records/profiles-state.ts";
import type { Tab } from "../records/tab.ts";
import { err, ok } from "../result.ts";
import type { Result } from "../result.ts";
import { close, leaf, panes, resize, split } from "./layout.ts";
import { groupOf, moveTab, orderedProfiles } from "./ordering.ts";

export type StateError =
  | "unknownProfile"
  | "unknownTab"
  | "unknownGroup"
  | "unknownPane"
  | "unknownSplit"
  /** The last profile cannot be removed. */
  | "lastProfile"
  /** A profile keeps at least one tab. */
  | "lastTab"
  | "otherProfile"
  /** The profile's last tab of a single-instance app, such as Gmail, stays. */
  | "required"
  /** Only a tab alone in its group can join another. */
  | "alreadyGrouped"
  /** The tab is alone in its group already. */
  | "notGrouped";

type Changed = Result<ProfilesState, StateError>;

export const groupOfOne = (tab: Tab, ids: Ids): Group => ({
  id: ids(),
  layout: leaf(ids(), tab.id),
  profileId: tab.profileId,
  tabIds: [tab.id],
});

export const FIRST_PROFILE_LABEL = "Personal";

/** A tab of the app at its start page. */
export const newTab = (ids: Ids, profileId: string, app: App): Tab => ({
  appId: app.id,
  health: "ok",
  id: ids(),
  pinned: false,
  profileId,
  sleeping: false,
  title: app.name,
  url: app.url,
  zoom: 1,
});

/** A profile with a new id, coloured from the palette unless `color` is given; its order is set where it is added. */
export const newProfile = (
  ids: Ids,
  label: string,
  color?: string
): Omit<Profile, "order"> => {
  const id = ids();
  return { color: color ?? colorFor(id), id, label, status: { kind: "ok" } };
};

/** The state of a profile with one tab in a group of one, selected. */
export const freshState = (
  profile: Profile,
  tab: Tab,
  ids: Ids
): ProfilesState => ({
  groups: [groupOfOne(tab, ids)],
  profiles: [profile],
  selectedProfileId: profile.id,
  tabs: [tab],
});

/** The state of a first launch: one profile with one tab of `app`, selected. */
export const firstState = (ids: Ids, app: App): ProfilesState => {
  const profile = newProfile(ids, FIRST_PROFILE_LABEL);
  return freshState(
    { ...profile, order: 0 },
    newTab(ids, profile.id, app),
    ids
  );
};

const hasProfile = (state: ProfilesState, profileId: string) =>
  state.profiles.some((profile) => profile.id === profileId);

/** Adds a profile after the others, with `tab` as its first tab. */
export const addProfile = (
  state: ProfilesState,
  profile: Omit<Profile, "order">,
  tab: Tab,
  ids: Ids
): ProfilesState => {
  const order = Math.max(-1, ...state.profiles.map((found) => found.order)) + 1;
  return {
    ...state,
    groups: [...state.groups, groupOfOne(tab, ids)],
    profiles: [...state.profiles, { ...profile, order }],
    tabs: [...state.tabs, tab],
  };
};

/** Removes a profile with its tabs and groups; the first remaining profile is selected if it was. */
export const removeProfile = (
  state: ProfilesState,
  profileId: string
): Changed => {
  if (!hasProfile(state, profileId)) {
    return err("unknownProfile");
  }
  const profiles = state.profiles.filter((profile) => profile.id !== profileId);
  const [first] = orderedProfiles(profiles);
  if (first === undefined) {
    return err("lastProfile");
  }
  return ok({
    groups: state.groups.filter((group) => group.profileId !== profileId),
    profiles,
    selectedProfileId:
      state.selectedProfileId === profileId
        ? first.id
        : state.selectedProfileId,
    tabs: state.tabs.filter((tab) => tab.profileId !== profileId),
  });
};

export const selectProfile = (
  state: ProfilesState,
  profileId: string
): Changed =>
  hasProfile(state, profileId)
    ? ok({ ...state, selectedProfileId: profileId })
    : err("unknownProfile");

export const setProfileStatus = (
  state: ProfilesState,
  profileId: string,
  status: ProfileStatus
): Changed =>
  hasProfile(state, profileId)
    ? ok({
        ...state,
        profiles: state.profiles.map((profile) =>
          profile.id === profileId ? { ...profile, status } : profile
        ),
      })
    : err("unknownProfile");

/** What a tab may change about itself after it was added. */
export type TabPatch = Partial<
  Pick<Tab, "health" | "sleeping" | "title" | "url" | "zoom" | "pinned">
>;

export const updateTab = (
  state: ProfilesState,
  tabId: string,
  patch: TabPatch
): Changed =>
  state.tabs.some((tab) => tab.id === tabId)
    ? ok({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, ...patch } : tab
        ),
      })
    : err("unknownTab");

/** Where a tab joins a group: beside or below one of the group's panes. */
export interface Placement {
  readonly groupId: string;
  readonly paneId: string;
  readonly orientation: Orientation;
}

/** Moves a tab that is alone in its group into another group of its profile, splitting one of that group's panes. */
export const splitInto = (
  state: ProfilesState,
  tabId: string,
  placement: Placement,
  ids: Ids
): Changed => {
  const tab = state.tabs.find((found) => found.id === tabId);
  const own = groupOf(tabId, state.groups);
  const target = state.groups.find((group) => group.id === placement.groupId);
  if (tab === undefined || own === undefined) {
    return err("unknownTab");
  }
  if (target === undefined) {
    return err("unknownGroup");
  }
  if (target.profileId !== tab.profileId) {
    return err("otherProfile");
  }
  if (own.tabIds.length > 1 || own.id === target.id) {
    return err("alreadyGrouped");
  }
  const result = split(
    target.layout,
    placement.paneId,
    placement.orientation,
    tabId,
    ids
  );
  if (result === undefined) {
    return err("unknownPane");
  }
  const joined: Group = {
    ...target,
    layout: result.layout,
    tabIds: [...target.tabIds, tabId],
  };
  return ok({
    ...state,
    groups: state.groups.flatMap((group) => {
      if (group.id === own.id) {
        return [];
      }
      return group.id === target.id ? [joined] : [group];
    }),
  });
};

/** Adds a tab after the profile's others, in a group of its own or split into a group. */
export const addTab = (
  state: ProfilesState,
  tab: Tab,
  ids: Ids,
  placement?: Placement
): Changed => {
  if (!hasProfile(state, tab.profileId)) {
    return err("unknownProfile");
  }
  const added: ProfilesState = {
    ...state,
    groups: [...state.groups, groupOfOne(tab, ids)],
    tabs: [...state.tabs, tab],
  };
  return placement === undefined
    ? ok(added)
    : splitInto(added, tab.id, placement, ids);
};

const withoutTab = (group: Group, tabId: string): Group | undefined => {
  const pane = panes(group.layout).find((found) =>
    found.tabIds.includes(tabId)
  );
  if (pane === undefined || group.tabIds.length <= 1) {
    return undefined;
  }
  return {
    ...group,
    layout: close(group.layout, pane.paneId),
    tabIds: group.tabIds.filter((id) => id !== tabId),
  };
};

/** Whether an app keeps one tab per profile, as the catalog says of Gmail. */
export type SingleInstance = (appId: string) => boolean;

/** The tab an app opens to: the profile's one tab of a single-instance app when it has it, else `tab`, added as addTab adds it. */
export const openTab = (
  state: ProfilesState,
  tab: Tab,
  ids: Ids,
  singleInstance: SingleInstance,
  placement?: Placement
): Result<{ readonly state: ProfilesState; readonly tab: Tab }, StateError> => {
  const existing = singleInstance(tab.appId)
    ? state.tabs.find(
        (found) =>
          found.profileId === tab.profileId && found.appId === tab.appId
      )
    : undefined;
  if (existing !== undefined) {
    return ok({ state, tab: existing });
  }
  const added = addTab(state, tab, ids, placement);
  return added.ok ? ok({ state: added.value, tab }) : added;
};

/** Whether the tab may close: a profile keeps at least one tab, and its last tab of a single-instance app. */
export const canClose = (
  state: ProfilesState,
  tabId: string,
  singleInstance: SingleInstance
): Result<undefined, StateError> => {
  const tab = state.tabs.find((found) => found.id === tabId);
  if (tab === undefined) {
    return err("unknownTab");
  }
  const others = state.tabs.filter(
    (found) => found.profileId === tab.profileId && found.id !== tabId
  );
  if (
    singleInstance(tab.appId) &&
    !others.some((found) => found.appId === tab.appId)
  ) {
    return err("required");
  }
  return others.length === 0 ? err("lastTab") : ok(undefined);
};

/** Closes a tab; its pane closes with it, and a group left empty goes. */
export const closeTab = (
  state: ProfilesState,
  tabId: string,
  singleInstance: SingleInstance
): Changed => {
  const closeable = canClose(state, tabId, singleInstance);
  if (!closeable.ok) {
    return closeable;
  }
  return ok({
    ...state,
    groups: state.groups.flatMap((group) => {
      if (!group.tabIds.includes(tabId)) {
        return [group];
      }
      const left = withoutTab(group, tabId);
      return left === undefined ? [] : [left];
    }),
    tabs: state.tabs.filter((found) => found.id !== tabId),
  });
};

/** Takes a tab out of its group into a group of its own. */
export const leaveGroup = (
  state: ProfilesState,
  tabId: string,
  ids: Ids,
  to?: number
): Changed => {
  const tab = state.tabs.find((found) => found.id === tabId);
  const group = groupOf(tabId, state.groups);
  if (tab === undefined || group === undefined) {
    return err("unknownTab");
  }
  const left = withoutTab(group, tabId);
  if (left === undefined) {
    return err("notGrouped");
  }
  const next = {
    ...state,
    groups: [
      ...state.groups.map((found) => (found.id === group.id ? left : found)),
      groupOfOne(tab, ids),
    ],
  };
  return to === undefined ? ok(next) : moveTabTo(next, tabId, to);
};

/** Puts a tab beside the pane of another tab of another group, vertically, taking it out of its own group first. */
export const joinTab = (
  state: ProfilesState,
  tabId: string,
  targetTabId: string,
  ids: Ids
): Changed => {
  const own = groupOf(tabId, state.groups);
  const target = groupOf(targetTabId, state.groups);
  const pane = panes(target?.layout ?? null).find((found) =>
    found.tabIds.includes(targetTabId)
  );
  if (own === undefined || target === undefined || pane === undefined) {
    return err("unknownTab");
  }
  if (own.id === target.id) {
    return err("alreadyGrouped");
  }
  const alone =
    own.tabIds.length > 1 ? leaveGroup(state, tabId, ids) : ok(state);
  return alone.ok
    ? splitInto(
        alone.value,
        tabId,
        { groupId: target.id, orientation: "vertical", paneId: pane.paneId },
        ids
      )
    : alone;
};

/** Makes one group of tabs that are each alone in theirs, the first tab's group taking the others, each split off the pane added before it. */
export const createGroup = (
  state: ProfilesState,
  tabIds: readonly [string, ...string[]],
  orientation: Orientation,
  ids: Ids
): Result<{ state: ProfilesState; groupId: string }, StateError> => {
  const [first, ...rest] = tabIds;
  const group = groupOf(first, state.groups);
  if (group === undefined) {
    return err("unknownTab");
  }
  if (group.tabIds.length > 1) {
    return err("alreadyGrouped");
  }
  let current = state;
  for (const tabId of rest) {
    const target = current.groups.find((found) => found.id === group.id);
    const last = target === undefined ? undefined : panes(target.layout).at(-1);
    if (last === undefined) {
      return err("unknownGroup");
    }
    const next = splitInto(
      current,
      tabId,
      { groupId: group.id, orientation, paneId: last.paneId },
      ids
    );
    if (!next.ok) {
      return next;
    }
    current = next.value;
  }
  return ok({ groupId: group.id, state: current });
};

export const resizeSplit = (
  state: ProfilesState,
  groupId: string,
  splitId: string,
  ratio: number
): Changed => {
  const group = state.groups.find((found) => found.id === groupId);
  if (group === undefined) {
    return err("unknownGroup");
  }
  const layout = resize(group.layout, splitId, ratio);
  if (layout === group.layout) {
    return err("unknownSplit");
  }
  return ok({
    ...state,
    groups: state.groups.map((found) =>
      found.id === groupId ? { ...found, layout } : found
    ),
  });
};

/** Moves the row holding the tab to row `to` of its profile's tab list. */
export const moveTabTo = (
  state: ProfilesState,
  tabId: string,
  to: number
): Changed =>
  state.tabs.some((tab) => tab.id === tabId)
    ? ok({ ...state, tabs: moveTab(state.tabs, state.groups, tabId, to) })
    : err("unknownTab");

/** The first group of a profile in sidebar order. */
export const firstGroup = (
  state: ProfilesState,
  profileId: string
): Group | undefined => {
  const first = state.tabs.find((tab) => tab.profileId === profileId);
  return first === undefined ? undefined : groupOf(first.id, state.groups);
};
