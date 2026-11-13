import type { ProfilesState } from "../records/profiles-state.ts";
import type { Window } from "../records/window.ts";
import { firstGroup } from "./state.ts";

/** The group the main window shows: the one it showed, while that is still a group of the selected profile, else the profile's first group. */
export const mainGroupOf = (
  windows: readonly Window[],
  state: ProfilesState
): string | undefined => {
  const shown = windows.find((window) => window.kind === "main")?.groupId;
  const group = state.groups.find((found) => found.id === shown);
  return group !== undefined && group.profileId === state.selectedProfileId
    ? group.id
    : firstGroup(state, state.selectedProfileId)?.id;
};
