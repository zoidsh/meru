import type { Ids } from "../ports.ts";
import type { App } from "../records/app.ts";
import type { Group } from "../records/group.ts";
import type { Beside, Layout, Placement } from "../records/layout.ts";
import { colorFor } from "../records/profile.ts";
import type { Profile, ProfileStatus } from "../records/profile.ts";
import type { ProfilesState } from "../records/profiles-state.ts";
import type { Tab } from "../records/tab.ts";
import { err, ok } from "../result.ts";
import type { Result } from "../result.ts";
import {
  equalise,
  close,
  leaf,
  movePane,
  paneOfTab,
  resize,
  split,
  swap,
} from "./layout.ts";
import { groupOf, moveTab, orderedProfiles } from "./ordering.ts";
import { isPinned } from "./pinned.ts";
import type { SingleInstance } from "./pinned.ts";

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
  /** Only a tab alone in its group can join another. */
  | "alreadyGrouped"
  /** The tab is alone in its group already. */
  | "notGrouped"
  /** A pinned tab stays open, keeps its row and keeps its group. */
  | "pinned";

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

/** What the user may change about a profile. */
export interface ProfilePatch {
  readonly label?: string;
  readonly color?: string;
}

export const updateProfile = (
  state: ProfilesState,
  profileId: string,
  patch: ProfilePatch
): Changed => {
  if (!hasProfile(state, profileId)) {
    return err("unknownProfile");
  }
  return ok({
    ...state,
    profiles: state.profiles.map((found) => {
      if (found.id !== profileId) {
        return found;
      }
      return {
        ...found,
        label: patch.label ?? found.label,
        ...(patch.color === undefined ? {} : { color: patch.color }),
      };
    }),
  });
};

/** What a tab may change about itself after it was added. */
export type TabPatch = Partial<
  Pick<Tab, "health" | "sleeping" | "title" | "url" | "zoom">
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

/** Moves the tab's pane beside another pane of the same group. */
const movePaneOf = (
  state: ProfilesState,
  tabId: string,
  group: Group,
  placement: Placement
): Changed => {
  const paneId = paneOfTab(group.layout, tabId);
  const moved =
    paneId === undefined
      ? undefined
      : movePane(group.layout, paneId, placement.paneId, placement);
  if (moved === undefined) {
    return err("unknownPane");
  }
  return ok({
    ...state,
    groups: state.groups.map((found) =>
      found.id === group.id ? { ...group, layout: moved } : found
    ),
  });
};

/** Moves a tab into a group of its profile, splitting one of that group's panes: a tab alone in its group from that group, or a tab of the group from its own pane. */
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
  if (own.id === target.id) {
    return movePaneOf(state, tabId, target, placement);
  }
  if (own.tabIds.length > 1) {
    return err("alreadyGrouped");
  }
  const result = split(target.layout, placement.paneId, placement, tabId, ids);
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
  const paneId = paneOfTab(group.layout, tabId);
  if (paneId === undefined || group.tabIds.length <= 1) {
    return undefined;
  }
  return {
    ...group,
    layout: close(group.layout, paneId),
    tabIds: group.tabIds.filter((id) => id !== tabId),
  };
};

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

/** Whether the tab may close: a pinned tab stays, and a profile keeps at least one tab. */
export const canClose = (
  state: ProfilesState,
  tabId: string,
  singleInstance: SingleInstance
): Result<undefined, StateError> => {
  const tab = state.tabs.find((found) => found.id === tabId);
  if (tab === undefined) {
    return err("unknownTab");
  }
  if (isPinned(tab, singleInstance)) {
    return err("pinned");
  }
  return state.tabs.some(
    (found) => found.profileId === tab.profileId && found.id !== tabId
  )
    ? ok(undefined)
    : err("lastTab");
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

/** Takes a tab out of its group into a group of its own; a pinned tab stays, the others leaving it. */
export const leaveGroup = (
  state: ProfilesState,
  tabId: string,
  ids: Ids,
  singleInstance: SingleInstance,
  to?: number
): Changed => {
  const tab = state.tabs.find((found) => found.id === tabId);
  const group = groupOf(tabId, state.groups);
  if (tab === undefined || group === undefined) {
    return err("unknownTab");
  }
  if (isPinned(tab, singleInstance)) {
    return err("pinned");
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
  return to === undefined
    ? ok(next)
    : moveTabTo(next, tabId, to, singleInstance);
};

/** Puts a tab beside the pane of another tab where `beside` says: out of its own group first when that is another, or from its own pane when the two share a group. */
export const joinTab = (
  state: ProfilesState,
  tabId: string,
  targetTabId: string,
  beside: Beside,
  ids: Ids,
  singleInstance: SingleInstance
): Changed => {
  const own = groupOf(tabId, state.groups);
  const target = groupOf(targetTabId, state.groups);
  const paneId = paneOfTab(target?.layout ?? null, targetTabId);
  if (own === undefined || target === undefined || paneId === undefined) {
    return err("unknownTab");
  }
  if (tabId === targetTabId) {
    return err("alreadyGrouped");
  }
  if (
    state.tabs.some((tab) => tab.id === tabId && isPinned(tab, singleInstance))
  ) {
    return err("pinned");
  }
  const alone =
    own.id !== target.id && own.tabIds.length > 1
      ? leaveGroup(state, tabId, ids, singleInstance)
      : ok(state);
  return alone.ok
    ? splitInto(
        alone.value,
        tabId,
        { ...beside, groupId: target.id, paneId },
        ids
      )
    : alone;
};

const withLayout = (
  state: ProfilesState,
  groupId: string,
  layout: Layout
): ProfilesState => ({
  ...state,
  groups: state.groups.map((found) =>
    found.id === groupId ? { ...found, layout } : found
  ),
});

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
  return ok(withLayout(state, groupId, layout));
};

/** Trades the places of two of the group's panes, each keeping its tab. */
export const swapPanes = (
  state: ProfilesState,
  groupId: string,
  a: string,
  b: string
): Changed => {
  const group = state.groups.find((found) => found.id === groupId);
  if (group === undefined) {
    return err("unknownGroup");
  }
  const layout = swap(group.layout, a, b);
  return layout === undefined
    ? err("unknownPane")
    : ok(withLayout(state, groupId, layout));
};

/** Gives each pane of every run of the group's splits of one orientation the same share of it. */
export const equaliseGroup = (
  state: ProfilesState,
  groupId: string
): Changed => {
  const group = state.groups.find((found) => found.id === groupId);
  return group === undefined
    ? err("unknownGroup")
    : ok(withLayout(state, groupId, equalise(group.layout)));
};

/** Moves the row holding the tab to row `to` of its profile's tab list, below the pinned rows; a pinned tab's row stays. */
export const moveTabTo = (
  state: ProfilesState,
  tabId: string,
  to: number,
  singleInstance: SingleInstance
): Changed => {
  const tab = state.tabs.find((found) => found.id === tabId);
  if (tab === undefined) {
    return err("unknownTab");
  }
  return isPinned(tab, singleInstance)
    ? err("pinned")
    : ok({
        ...state,
        tabs: moveTab(state.tabs, state.groups, tabId, to, singleInstance),
      });
};

/** The first group of a profile in sidebar order. */
export const firstGroup = (
  state: ProfilesState,
  profileId: string
): Group | undefined => {
  const first = state.tabs.find((tab) => tab.profileId === profileId);
  return first === undefined ? undefined : groupOf(first.id, state.groups);
};
