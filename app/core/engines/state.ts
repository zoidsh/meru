import { z } from "zod";

import type { Ids } from "../ports.ts";
import { groupSchema } from "../records/group.ts";
import type { Group } from "../records/group.ts";
import { idSchema } from "../records/id.ts";
import type { Orientation } from "../records/layout.ts";
import { PROFILE_COLORS, profileSchema } from "../records/profile.ts";
import type { Profile, ProfileStatus } from "../records/profile.ts";
import type { ProfilesState } from "../records/profiles-state.ts";
import { tabSchema } from "../records/tab.ts";
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
  /** Only a tab alone in its group can join another. */
  | "alreadyGrouped"
  /** The tab is alone in its group already. */
  | "notGrouped";

type Changed = Result<ProfilesState, StateError>;

const sameMembers = (a: readonly string[], b: readonly string[]) => {
  const sorted = b.toSorted();
  return (
    a.length === b.length &&
    a.toSorted().every((id, index) => id === sorted[index])
  );
};

const repeated = (ids: readonly string[]) =>
  ids.filter((id, index) => ids.indexOf(id) !== index);

/** What is wrong with the state, one sentence per broken invariant; empty when it holds. */
export const validateState = (state: ProfilesState): string[] => {
  const problems: string[] = [];
  const kinds = {
    group: state.groups.map((group) => group.id),
    pane: state.groups.flatMap((group) =>
      panes(group.layout).map((pane) => pane.paneId)
    ),
    profile: state.profiles.map((profile) => profile.id),
    tab: state.tabs.map((tab) => tab.id),
  };
  for (const [kind, ids] of Object.entries(kinds)) {
    for (const id of new Set(repeated(ids))) {
      problems.push(`${kind} ${id} appears more than once`);
    }
  }
  const profileIds = new Set(kinds.profile);
  if (!profileIds.has(state.selectedProfileId)) {
    problems.push(`the selected profile ${state.selectedProfileId} is missing`);
  }
  const tabs = new Map(state.tabs.map((tab) => [tab.id, tab]));
  for (const tab of state.tabs) {
    if (!profileIds.has(tab.profileId)) {
      problems.push(`tab ${tab.id} belongs to no profile`);
    }
    const count = state.groups.filter((group) =>
      group.tabIds.includes(tab.id)
    ).length;
    if (count !== 1) {
      problems.push(`tab ${tab.id} is in ${count} groups`);
    }
  }
  for (const group of state.groups) {
    if (!profileIds.has(group.profileId)) {
      problems.push(`group ${group.id} belongs to no profile`);
    }
    if (group.tabIds.length === 0) {
      problems.push(`group ${group.id} is empty`);
    }
    for (const id of new Set(repeated(group.tabIds))) {
      problems.push(`group ${group.id} lists tab ${id} more than once`);
    }
    for (const id of group.tabIds) {
      const tab = tabs.get(id);
      if (tab === undefined) {
        problems.push(`group ${group.id} lists the missing tab ${id}`);
      } else if (tab.profileId !== group.profileId) {
        problems.push(`group ${group.id} holds tab ${id} of another profile`);
      }
    }
    const shown = panes(group.layout).flatMap((pane) => pane.tabIds);
    if (!sameMembers(shown, group.tabIds)) {
      problems.push(`group ${group.id}'s layout does not show its tabs`);
    }
  }
  for (const profile of state.profiles) {
    if (!state.tabs.some((tab) => tab.profileId === profile.id)) {
      problems.push(`profile ${profile.id} has no tab`);
    }
  }
  return problems;
};

/** A colour from the palette, picked by the profile's id, which is random. */
export const colorFor = (profileId: string): string => {
  let sum = 0;
  for (const char of profileId) {
    sum += char.codePointAt(0) ?? 0;
  }
  return PROFILE_COLORS[sum % PROFILE_COLORS.length] ?? PROFILE_COLORS[0];
};

export const groupOfOne = (tab: Tab, ids: Ids): Group => ({
  id: ids(),
  layout: leaf(ids(), tab.id),
  profileId: tab.profileId,
  tabIds: [tab.id],
});

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

/** Closes a tab; its pane closes with it, and a group left empty goes. */
export const closeTab = (state: ProfilesState, tabId: string): Changed => {
  const tab = state.tabs.find((found) => found.id === tabId);
  if (tab === undefined) {
    return err("unknownTab");
  }
  if (
    !state.tabs.some(
      (found) => found.profileId === tab.profileId && found.id !== tabId
    )
  ) {
    return err("lastTab");
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
  ids: Ids
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
  return ok({
    ...state,
    groups: [
      ...state.groups.map((found) => (found.id === group.id ? left : found)),
      groupOfOne(tab, ids),
    ],
  });
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

const listOf = <T>(data: unknown, key: string, schema: z.ZodType<T>) => {
  const list = z.object({ [key]: z.array(z.unknown()) }).safeParse(data);
  const items = list.success ? (list.data[key] ?? []) : [];
  const parsed = items.flatMap((item) => {
    const one = schema.safeParse(item);
    return one.success ? [one.data] : [];
  });
  return { dropped: items.length - parsed.length, parsed };
};

const uniqueBy = <T extends { readonly id: string }>(items: readonly T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
};

export interface Repair {
  readonly ids: Ids;
  /** The state of a first launch, for data that holds no usable profile. */
  readonly fresh: () => ProfilesState;
  /** A tab for a profile left with none. */
  readonly tabFor: (profileId: string) => Tab;
}

/** Keeps whatever of `data` holds together: the profiles and tabs that parse, the groups whose tabs and layout agree, a group of one for each tab left without, and a tab for each profile left with none. */
export const repairState = (
  data: unknown,
  repair: Repair
): { readonly state: ProfilesState; readonly dropped: string[] } => {
  const dropped: string[] = [];
  const read = <T extends { readonly id: string }>(
    key: string,
    schema: z.ZodType<T>
  ) => {
    const list = listOf(data, key, schema);
    const parsed = uniqueBy(list.parsed);
    const count = list.dropped + list.parsed.length - parsed.length;
    if (count > 0) {
      dropped.push(`${count} ${key}`);
    }
    return parsed;
  };
  const profiles = read("profiles", profileSchema);
  if (profiles.length === 0) {
    return { dropped: ["every profile"], state: repair.fresh() };
  }
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const tabs = read("tabs", tabSchema).filter((tab) =>
    profileIds.has(tab.profileId)
  );
  const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
  const claimed = new Set<string>();
  const paneIds = new Set<string>();
  const groups = read("groups", groupSchema).filter((group) => {
    const shown = panes(group.layout);
    const holds =
      profileIds.has(group.profileId) &&
      group.tabIds.length > 0 &&
      repeated(group.tabIds).length === 0 &&
      group.tabIds.every(
        (id) =>
          tabsById.get(id)?.profileId === group.profileId && !claimed.has(id)
      ) &&
      sameMembers(
        shown.flatMap((pane) => pane.tabIds),
        group.tabIds
      ) &&
      shown.every((pane) => !paneIds.has(pane.paneId));
    if (holds) {
      for (const id of group.tabIds) {
        claimed.add(id);
      }
      for (const pane of shown) {
        paneIds.add(pane.paneId);
      }
    } else {
      dropped.push(`group ${group.id}`);
    }
    return holds;
  });
  for (const tab of tabs) {
    if (!claimed.has(tab.id)) {
      groups.push(groupOfOne(tab, repair.ids));
    }
  }
  for (const profile of profiles) {
    if (!tabs.some((tab) => tab.profileId === profile.id)) {
      const tab = repair.tabFor(profile.id);
      tabs.push(tab);
      groups.push(groupOfOne(tab, repair.ids));
    }
  }
  const selected = z.object({ selectedProfileId: idSchema }).safeParse(data);
  const [first] = orderedProfiles(profiles);
  const selectedProfileId =
    selected.success && profileIds.has(selected.data.selectedProfileId)
      ? selected.data.selectedProfileId
      : (first?.id ?? "");
  return { dropped, state: { groups, profiles, selectedProfileId, tabs } };
};
