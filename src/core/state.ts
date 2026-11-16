import { z } from "zod/mini";

import { APPS, isAppId } from "./apps.ts";
import { decodeVersioned } from "./store-file.ts";
import type { Decoded } from "./store-file.ts";

export const STATE_VERSION = 1;

/** What v3 names its first account; kept in English and translated when shown. */
export const DEFAULT_PROFILE_NAME = "Default";

/** v3's id for the Gmail tab, which every profile has, first. */
export const GMAIL_TAB_ID = "gmail";

const GMAIL_HOME = APPS.find((app) => app.id === "gmail")?.home ?? "";

// Loose at every level: a key a later build added on the same version, as a
// Beta may, survives this build rewriting the file.
const tabSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  /** A string rather than the known ids, so a later build's app is kept. */
  app: z.string(),
  url: z.string(),
  title: z.string(),
});

// Profiles and their tabs are decoded one by one, so no one entry can make the
// file, and with it every profile's sign-in, unreadable.
const profileSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  name: z.string(),
  tabs: z.optional(z.unknown()),
  selectedTabId: z.optional(z.unknown()),
});

const stateSchema = z.looseObject({
  version: z.literal(STATE_VERSION),
  profiles: z.array(z.unknown()),
  selectedProfileId: z.optional(z.unknown()),
  profilesToClear: z.optional(z.unknown()),
});

export type Tab = z.infer<typeof tabSchema>;

// Symbols, which a key read from JSON can never be and JSON never writes.
const UNREAD = Symbol("unread tab");
const TABS_AS_FOUND = Symbol("tabs as found");
const UNREAD_PROFILES = Symbol("unread profiles");
const CLEAR_AS_FOUND = Symbol("profiles to clear as found");

/**
 * What of `profilesToClear` is not a profile id: entries written back after
 * the ids, or a value that is not a list, written back while the list is
 * empty.
 */
type ClearAsFound = { entries: unknown[] } | { whole: unknown };

/**
 * An entry in the profiles that does not parse, kept as it was found and
 * written back after as many readable profiles as it followed.
 */
interface UnreadProfile {
  after: number;
  raw: unknown;
}

/** An entry in a profile's tabs that does not parse, kept as it was found. */
export interface UnreadTab {
  [UNREAD]: unknown;
}

export type TabEntry = Tab | UnreadTab;

export const isTab = (entry: TabEntry): entry is Tab => !(UNREAD in entry);

type StoredProfile = z.infer<typeof profileSchema>;

/** A profile once decoded: its tabs start with Gmail's, and one is selected. */
export interface Profile {
  [key: string]: unknown;
  id: string;
  name: string;
  tabs: TabEntry[];
  selectedTabId: string;
  /**
   * A `tabs` that is not a list, written back in its place; the tabs the
   * profile has instead live only in memory.
   */
  [TABS_AS_FOUND]?: unknown;
}

type StoredState = z.infer<typeof stateSchema>;

// Spelled out, since `Omit` drops every named key of a loose object's type.
export interface State {
  [key: string]: unknown;
  version: StoredState["version"];
  /** The profiles that parse; the rest are kept but never shown. */
  profiles: Profile[];
  selectedProfileId: string;
  /**
   * Removed profiles whose session data is still to be deleted, so a quit
   * between the removal and the clear is finished at the next launch.
   */
  profilesToClear?: string[];
  [UNREAD_PROFILES]?: readonly UnreadProfile[];
  [CLEAR_AS_FOUND]?: ClearAsFound;
}

export const gmailTab = (): Tab => ({
  id: GMAIL_TAB_ID,
  app: "gmail",
  url: GMAIL_HOME,
  title: "",
});

/**
 * The tabs of apps this build knows; the rest, and entries that do not parse,
 * are kept but not shown.
 */
export const knownTabs = (profile: Pick<Profile, "tabs">): Tab[] =>
  profile.tabs.filter((entry) => isTab(entry) && isAppId(entry.app)) as Tab[];

const readTabs = (stored: unknown): TabEntry[] =>
  (Array.isArray(stored) ? stored : []).map((entry: unknown) => {
    const parsed = tabSchema.safeParse(entry);

    return parsed.success ? parsed.data : { [UNREAD]: entry };
  });

/**
 * Puts a profile's tabs in the shape every reader relies on, rather than
 * refusing a file over them: one Gmail tab, first, ids unique, and a selected
 * tab that is shown, else Gmail's.
 */
const normalizeProfile = (profile: StoredProfile): Profile => {
  const stored = readTabs(profile.tabs);
  const gmails = stored.filter(isTab).filter((tab) => tab.app === "gmail");
  const gmail =
    gmails.find((tab) => tab.id === GMAIL_TAB_ID) ?? gmails[0] ?? gmailTab();
  const seen = new Set<string>();
  const tabs = [
    gmail,
    ...stored.filter((entry) => !isTab(entry) || entry.app !== "gmail"),
  ].filter((entry) => {
    if (!isTab(entry)) {
      return true;
    }

    if (seen.has(entry.id)) {
      return false;
    }

    seen.add(entry.id);

    return true;
  });
  const { selectedTabId } = profile;
  const decoded: Profile = {
    ...profile,
    tabs,
    selectedTabId:
      typeof selectedTabId === "string" &&
      knownTabs({ tabs }).some((tab) => tab.id === selectedTabId)
        ? selectedTabId
        : gmail.id,
  };

  if (profile.tabs !== undefined && !Array.isArray(profile.tabs)) {
    decoded[TABS_AS_FOUND] = profile.tabs;
  }

  return decoded;
};

const encodeProfile = (profile: Profile) => ({
  ...profile,
  tabs:
    TABS_AS_FOUND in profile
      ? profile[TABS_AS_FOUND]
      : profile.tabs.map((entry) => (isTab(entry) ? entry : entry[UNREAD])),
});

/**
 * The state as its file holds it, with every profile and tab entry that did
 * not parse as it was found, in its place.
 */
export const encodeState = (state: State): unknown => {
  const unread = state[UNREAD_PROFILES] ?? [];
  const { length } = state.profiles;
  const placedAfter = (count: number) =>
    unread
      .filter((entry) => Math.min(entry.after, length) === count)
      .map((entry) => entry.raw);

  const asFound = state[CLEAR_AS_FOUND];
  let profilesToClear: unknown = state.profilesToClear;

  if (asFound && "entries" in asFound) {
    profilesToClear = [...(state.profilesToClear ?? []), ...asFound.entries];
  } else if (asFound && (state.profilesToClear ?? []).length === 0) {
    profilesToClear = asFound.whole;
  }

  return {
    ...state,
    ...(profilesToClear === undefined ? {} : { profilesToClear }),
    profiles: [
      ...placedAfter(0),
      ...state.profiles.flatMap((profile, index) => [
        encodeProfile(profile),
        ...placedAfter(index + 1),
      ]),
    ],
  };
};

/** The ids of profiles that do not parse, where an id can be read. */
const unreadProfileIds = (state: State) =>
  (state[UNREAD_PROFILES] ?? []).flatMap(({ raw }) =>
    typeof raw === "object" &&
    raw !== null &&
    "id" in raw &&
    typeof raw.id === "string"
      ? [raw.id]
      : []
  );

/** A profile with only its Gmail tab. */
export const newProfile = (id: string, name: string): Profile => ({
  id,
  name,
  tabs: [gmailTab()],
  selectedTabId: GMAIL_TAB_ID,
});

const isId = (entry: unknown): entry is string =>
  typeof entry === "string" && entry !== "";

export const decodeState = (value: unknown): Decoded<State> => {
  const result = decodeVersioned(value, STATE_VERSION, stateSchema);

  if (result.kind !== "read") {
    return result;
  }

  const profiles: Profile[] = [];
  const unread: UnreadProfile[] = [];

  for (const entry of result.value.profiles) {
    const parsed = profileSchema.safeParse(entry);

    if (parsed.success) {
      profiles.push(normalizeProfile(parsed.data));
    } else {
      unread.push({ after: profiles.length, raw: entry });
    }
  }

  const { selectedProfileId, profilesToClear, ...rest } = result.value;
  const state: State = {
    ...rest,
    ...(profilesToClear === undefined
      ? {}
      : {
          profilesToClear: Array.isArray(profilesToClear)
            ? profilesToClear.filter(isId)
            : [],
        }),
    profiles,
    selectedProfileId: profiles.some(
      (profile) => profile.id === selectedProfileId
    )
      ? String(selectedProfileId)
      : (profiles[0]?.id ?? ""),
  };

  if (unread.length > 0) {
    state[UNREAD_PROFILES] = unread;
  }

  if (profilesToClear !== undefined && !Array.isArray(profilesToClear)) {
    state[CLEAR_AS_FOUND] = { whole: profilesToClear };
  } else if (profilesToClear?.some((entry) => !isId(entry))) {
    state[CLEAR_AS_FOUND] = {
      entries: profilesToClear.filter((entry) => !isId(entry)),
    };
  }

  return { kind: "read", value: state };
};

/**
 * The state with a first profile, selected, when none of its profiles could
 * be read; those stay in the file.
 */
export const withAProfile = (state: State, newId: () => string): State =>
  state.profiles.length > 0
    ? state
    : addProfile(state, newProfile(newId(), DEFAULT_PROFILE_NAME));

/**
 * The state Meru starts from when it has none: one profile, selected, as v3
 * creates its first account. `newId` is v3's account id generator,
 * `crypto.randomUUID`, since a profile id is the account id v3 would have made.
 */
export const createInitialState = (newId: () => string): State => {
  const id = newId();

  return {
    version: STATE_VERSION,
    profiles: [newProfile(id, DEFAULT_PROFILE_NAME)],
    selectedProfileId: id,
  };
};

/** v3's partition name, so a profile's session is its v3 account's session. */
export const profilePartition = (profileId: string) => `persist:${profileId}`;

/** The first `name(n)`, counting from 2, that no profile already has. */
export const nextProfileName = (
  state: State,
  name: (n: number) => string
): string => {
  const taken = new Set(state.profiles.map((profile) => profile.name));
  let n = 2;

  while (taken.has(name(n))) {
    n += 1;
  }

  return name(n);
};

/** Appends a profile and selects it. */
export const addProfile = (state: State, profile: Profile): State => ({
  ...state,
  profiles: [...state.profiles, profile],
  selectedProfileId: profile.id,
});

/** Nothing when there is no such profile or it is already selected. */
export const selectProfile = (
  state: State,
  profileId: string
): State | undefined =>
  state.selectedProfileId !== profileId &&
  state.profiles.some((profile) => profile.id === profileId)
    ? { ...state, selectedProfileId: profileId }
    : undefined;

/** Whether the profile is listed and some other profile would be left. */
export const canRemoveProfile = (state: State, profileId: string) =>
  state.profiles.some((profile) => profile.id === profileId) &&
  state.profiles.some((profile) => profile.id !== profileId);

/**
 * Removing the selected profile selects the one to its right, or to its left
 * when it was the last; removing another leaves the selection alone. The id
 * goes on the list of profiles whose data is to be deleted. Every entry with
 * the id goes, so a hand-edited file listing it twice never keeps a profile
 * whose data is about to be cleared. Nothing when the profile cannot be
 * removed.
 */
export const removeProfile = (
  state: State,
  profileId: string
): State | undefined => {
  if (!canRemoveProfile(state, profileId)) {
    return;
  }

  const index = state.profiles.findIndex((profile) => profile.id === profileId);
  const profiles = state.profiles.filter((profile) => profile.id !== profileId);
  const neighbour = profiles[Math.min(index, profiles.length - 1)];

  return {
    ...state,
    profiles,
    selectedProfileId:
      state.selectedProfileId === profileId && neighbour
        ? neighbour.id
        : state.selectedProfileId,
    profilesToClear: [
      ...(state.profilesToClear ?? []).filter((id) => id !== profileId),
      profileId,
    ],
  };
};

/** Takes ids off the list of profiles whose data is to be deleted. */
export const forgetProfilesToClear = (
  state: State,
  profileIds: readonly string[]
): State | undefined =>
  profileIds.length === 0
    ? undefined
    : {
        ...state,
        profilesToClear: (state.profilesToClear ?? []).filter(
          (id) => !profileIds.includes(id)
        ),
      };

/**
 * The ids on the list to clear, split into those whose data may be deleted
 * and those that are still listed as profiles, readable or not, as in a
 * hand-edited file, whose data must never be.
 */
export const sortProfilesToClear = (state: State) => {
  const listed = new Set([
    ...state.profiles.map((profile) => profile.id),
    ...unreadProfileIds(state),
  ]);
  const ids = state.profilesToClear ?? [];

  return {
    clear: ids.filter((id) => !listed.has(id)),
    stillListed: ids.filter((id) => listed.has(id)),
  };
};

export const selectedProfile = (state: State): Profile => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === state.selectedProfileId
  );

  if (!profile) {
    throw new Error("The state holds no selected profile");
  }

  return profile;
};
