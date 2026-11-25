import { entitledProfiles } from "./entitlement.ts";
import type { Capability } from "./entitlement.ts";
import {
  gmailTab,
  knownTabs,
  switchDoNotDisturb,
  withDoNotDisturbOf,
} from "./state.ts";
import type { Profile, State, Tab } from "./state.ts";

/** The capabilities that shape the state a run may use. */
export const STATE_CAPABILITIES = [
  "profiles",
  "notificationGates",
  "savedSearches",
  "workspaceApps",
  "splitView",
  "bookmarks",
] as const satisfies readonly Capability[];

/** Whether the run holds each of `STATE_CAPABILITIES`. */
export type StateGrants = Record<(typeof STATE_CAPABILITIES)[number], boolean>;

export const stateGrants = (
  can: (capability: Capability) => boolean
): StateGrants => ({
  profiles: can("profiles"),
  notificationGates: can("notificationGates"),
  savedSearches: can("savedSearches"),
  workspaceApps: can("workspaceApps"),
  splitView: can("splitView"),
  bookmarks: can("bookmarks"),
});

/**
 * What a profile's splits, bookmarks or saved searches read as while
 * hidden, in their key's place, so the stored ones go back where they were
 * found.
 */
const HIDDEN: never[] = Object.freeze([]) as never[];

/** The profile's Gmail tab, in the main window, or a new profile's when it has none. */
const gmailOf = (profile: Profile): Tab => {
  const gmail = knownTabs(profile).find((tab) => tab.app === "gmail");

  if (!gmail) {
    return gmailTab();
  }

  const { ownWindow: _ownWindow, ...shown } = gmail;

  return shown as Tab;
};

/**
 * Each profile as `grants` let a run use it: without `workspaceApps` its
 * Gmail tab alone, selected; without that or `splitView` no split; without
 * `bookmarks` none, and without `savedSearches` no saved search.
 */
const profileView = (profile: Profile, grants: StateGrants): Profile => {
  let view = profile;

  if (!grants.workspaceApps) {
    const gmail = gmailOf(profile);

    view = { ...view, tabs: [gmail], selectedTabId: gmail.id };
  }

  if (
    (!grants.workspaceApps || !grants.splitView) &&
    Object.hasOwn(view, "splits")
  ) {
    view = { ...view, splits: HIDDEN };
  }

  if (!grants.bookmarks && Object.hasOwn(view, "bookmarks")) {
    view = { ...view, bookmarks: HIDDEN };
  }

  if (!grants.savedSearches && Object.hasOwn(view, "savedSearches")) {
    view = { ...view, savedSearches: HIDDEN };
  }

  return view;
};

/** The stored tab with the view's change to it, its own window as stored. */
const withChangesOf = (stored: Tab, changed: Tab): Tab => {
  const { ownWindow: _ownWindow, ...rest } = changed;

  return { ...stored, ...rest };
};

/**
 * The profile after `next`, a change made to `profileView` of `stored`,
 * with what the view left out as `stored` holds it: its tabs but the Gmail
 * tab, which takes the change but keeps where its window was stored, the
 * selection, the splits, the bookmarks and the saved searches. A Gmail tab
 * the view made for a profile with none is never written.
 */
const profileAfterView = (
  stored: Profile,
  grants: StateGrants,
  next: Profile
): Profile => {
  let written = next;

  if (!grants.workspaceApps) {
    const storedGmail = knownTabs(stored).find((tab) => tab.app === "gmail");
    const changed = knownTabs(next).find((tab) => tab.app === "gmail");
    written = {
      ...written,
      tabs:
        storedGmail && changed
          ? stored.tabs.map((entry) =>
              entry === storedGmail
                ? withChangesOf(storedGmail, changed)
                : entry
            )
          : stored.tabs,
      selectedTabId: stored.selectedTabId,
    };
  }

  if (written.splits === HIDDEN) {
    written = { ...written, splits: stored.splits ?? [] };
  }

  if (written.bookmarks === HIDDEN) {
    written = { ...written, bookmarks: stored.bookmarks };
  }

  if (written.savedSearches === HIDDEN) {
    written = { ...written, savedSearches: stored.savedSearches };
  }

  return written;
};

/**
 * The state a run may use: `entitledState`'s profiles, each as
 * `profileView` has it; and without `notificationGates` no Do Not Disturb,
 * so nothing holds a notification with no control on screen to end it.
 * What it leaves out stays stored.
 */
export const entitledView = (stored: State, grants: StateGrants): State => {
  const view = entitledState(stored, grants.profiles);
  const held = grants.notificationGates
    ? view
    : switchDoNotDisturb(view, undefined);

  return Object.values(grants).every(Boolean)
    ? held
    : {
        ...held,
        profiles: held.profiles.map((profile) => profileView(profile, grants)),
      };
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

  return Object.values(grants).every(Boolean)
    ? held
    : {
        ...held,
        profiles: held.profiles.map((profile) => {
          const found = stored.profiles.find(({ id }) => id === profile.id);

          return found ? profileAfterView(found, grants, profile) : profile;
        }),
      };
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
