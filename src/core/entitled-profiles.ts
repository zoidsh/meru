import { entitledProfiles } from "./entitlement.ts";
import type { Capability } from "./entitlement.ts";
import { switchDoNotDisturb, withDoNotDisturbOf } from "./state.ts";
import type { Profile, State } from "./state.ts";

/** The capabilities that shape the state a run may use. */
export const STATE_CAPABILITIES = [
  "profiles",
  "notificationGates",
  "savedSearches",
] as const satisfies readonly Capability[];

/** Whether the run holds each of `STATE_CAPABILITIES`. */
export type StateGrants = Record<(typeof STATE_CAPABILITIES)[number], boolean>;

export const stateGrants = (
  can: (capability: Capability) => boolean
): StateGrants => ({
  profiles: can("profiles"),
  notificationGates: can("notificationGates"),
  savedSearches: can("savedSearches"),
});

/**
 * What a profile's saved searches read as while hidden, in their key's
 * place, so the stored ones go back where they were found.
 */
const HIDDEN_SEARCHES: readonly never[] = Object.freeze([]);

/** Each profile with its saved searches, if any, hidden. */
const withoutSavedSearches = (state: State): State => ({
  ...state,
  profiles: state.profiles.map((profile) =>
    Object.hasOwn(profile, "savedSearches")
      ? { ...profile, savedSearches: HIDDEN_SEARCHES }
      : profile
  ),
});

/** Each profile whose saved searches were hidden with them as `stored` holds them. */
const withSavedSearchesOf = (state: State, stored: State): State => ({
  ...state,
  profiles: state.profiles.map((profile) => {
    const found = stored.profiles.find(({ id }) => id === profile.id);

    return found && profile.savedSearches === HIDDEN_SEARCHES
      ? { ...profile, savedSearches: found.savedSearches }
      : profile;
  }),
});

/**
 * The state a run may use: `entitledState`'s profiles; without
 * `notificationGates` no Do Not Disturb, so nothing holds a notification
 * with no control on screen to end it; and without `savedSearches` none of
 * any profile's. What it leaves out stays stored.
 */
export const entitledView = (stored: State, grants: StateGrants): State => {
  const view = entitledState(stored, grants.profiles);
  const held = grants.notificationGates
    ? view
    : switchDoNotDisturb(view, undefined);

  return grants.savedSearches ? held : withoutSavedSearches(held);
};

/**
 * The stored state after `next`, a change made to what `entitledView` gave
 * of `stored`: `storedAfter`'s profiles and selection, and whatever the view
 * left out of the rest as `stored` holds it.
 */
export const storedAfterView = (
  stored: State,
  grants: StateGrants,
  next: State
): State => {
  const written = storedAfter(
    stored,
    entitledState(stored, grants.profiles),
    next
  );

  const held = grants.notificationGates
    ? written
    : withDoNotDisturbOf(written, stored);

  return grants.savedSearches ? held : withSavedSearchesOf(held, stored);
};

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
