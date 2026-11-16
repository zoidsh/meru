import type { State } from "./state.ts";

export interface ViewPlan {
  /** The profiles that have a view, in the order of the profiles. */
  profileIds: string[];
  visibleProfileId: string;
}

/**
 * A profile gets its view when it is first selected and keeps it, hidden,
 * while another is shown, until it is removed. `existing` is the profiles
 * that have a view now.
 */
export const planViews = (
  state: Pick<State, "profiles" | "selectedProfileId">,
  existing: readonly string[]
): ViewPlan => ({
  profileIds: state.profiles
    .map((profile) => profile.id)
    .filter((id) => id === state.selectedProfileId || existing.includes(id)),
  visibleProfileId: state.selectedProfileId,
});
