import type { ProfilesState } from "../records/profiles-state.ts";
import { panes } from "./layout.ts";
import type { SingleInstance } from "./pinned.ts";

export const sameMembers = (a: readonly string[], b: readonly string[]) => {
  const sorted = b.toSorted();
  return (
    a.length === b.length &&
    a.toSorted().every((id, index) => id === sorted[index])
  );
};

export const repeated = (ids: readonly string[]) =>
  ids.filter((id, index) => ids.indexOf(id) !== index);

/** What is wrong with the state, one sentence per broken invariant; empty when it holds. */
export const validateState = (
  state: ProfilesState,
  singleInstance: SingleInstance
): string[] => {
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
    const own = state.tabs.filter((tab) => tab.profileId === profile.id);
    if (own.length === 0) {
      problems.push(`profile ${profile.id} has no tab`);
    }
    const single = own.map((tab) => tab.appId).filter(singleInstance);
    for (const appId of new Set(repeated(single))) {
      problems.push(`profile ${profile.id} has more than one ${appId} tab`);
    }
  }
  return problems;
};
