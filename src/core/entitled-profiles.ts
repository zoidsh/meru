import { entitledProfiles } from "./entitlement.ts";
import type { Profile, State } from "./state.ts";

/**
 * The state a run may use: the stored one with more than one profile
 * allowed, else the first profile alone, selected, whichever the file
 * selects. The others stay in the stored state, untouched, for a license to
 * bring back. The first reads as awake and enabled, being selected, with any
 * stored `asleep` or `disabled` kept as found.
 */
export const entitledState = (stored: State, multiple: boolean): State => {
  const profiles = entitledProfiles(stored.profiles, multiple);
  const [first] = profiles;

  if (!first || profiles.length === stored.profiles.length) {
    return stored;
  }

  return { ...stored, profiles: [...profiles], selectedProfileId: first.id };
};

/** The stored profiles `entitledState` leaves out, in their stored order. */
export const lockedProfiles = (stored: State, multiple: boolean): Profile[] => {
  const entitled = entitledState(stored, multiple);

  return stored.profiles.filter(
    (profile) => !entitled.profiles.some(({ id }) => id === profile.id)
  );
};

/**
 * The stored state after `next`, a change made to `view`, what
 * `entitledState` gave of `stored`: the profiles the view left out follow
 * the changed ones in their stored order, and the stored selection stands
 * while the change kept the view's.
 */
export const storedAfter = (stored: State, view: State, next: State): State => {
  if (view === stored) {
    return next;
  }

  const shown = new Set(view.profiles.map(({ id }) => id));
  const hidden = stored.profiles.filter((profile) => !shown.has(profile.id));

  return {
    ...next,
    profiles: [
      ...next.profiles,
      ...hidden.filter(
        (profile) => !next.profiles.some(({ id }) => id === profile.id)
      ),
    ],
    selectedProfileId:
      next.selectedProfileId === view.selectedProfileId
        ? stored.selectedProfileId
        : next.selectedProfileId,
  };
};
