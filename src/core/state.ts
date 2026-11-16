import { z } from "zod/mini";

import { APPS, isAppId } from "./apps.ts";

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

const profileSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  name: z.string(),
  // Optional, so every file slice 1.2 wrote reads as it is.
  tabs: z.optional(z.array(tabSchema)),
  selectedTabId: z.optional(z.string()),
});

const stateSchema = z
  .looseObject({
    version: z.literal(STATE_VERSION),
    profiles: z.array(profileSchema).check(z.minLength(1)),
    selectedProfileId: z.string(),
    /**
     * Removed profiles whose session data is still to be deleted, so a quit
     * between the removal and the clear is finished at the next launch.
     */
    profilesToClear: z.optional(z.array(z.string().check(z.minLength(1)))),
  })
  .check(
    z.refine(
      (state) =>
        state.profiles.some(
          (profile) => profile.id === state.selectedProfileId
        ),
      { message: "The selected profile is not among the profiles" }
    )
  );

export type Tab = z.infer<typeof tabSchema>;

type StoredProfile = z.infer<typeof profileSchema>;

/** A profile once decoded: its tabs start with Gmail's, and one is selected. */
export type Profile = StoredProfile & { tabs: Tab[]; selectedTabId: string };

type StoredState = z.infer<typeof stateSchema>;

// Spelled out, since `Omit` drops every named key of a loose object's type.
export interface State {
  [key: string]: unknown;
  version: StoredState["version"];
  profiles: Profile[];
  selectedProfileId: string;
  profilesToClear?: StoredState["profilesToClear"];
}

export const gmailTab = (): Tab => ({
  id: GMAIL_TAB_ID,
  app: "gmail",
  url: GMAIL_HOME,
  title: "",
});

/** The tabs of apps this build knows; the rest are kept but not shown. */
export const knownTabs = (profile: Pick<Profile, "tabs">) =>
  profile.tabs.filter((tab) => isAppId(tab.app));

/**
 * Puts a profile's tabs in the shape every reader relies on, rather than
 * refusing a file over them: one Gmail tab, first, ids unique, and a selected
 * tab that is shown, else Gmail's.
 */
const normalizeProfile = (profile: StoredProfile): Profile => {
  const stored = profile.tabs ?? [];
  const gmail = stored.find((tab) => tab.app === "gmail") ?? gmailTab();
  const seen = new Set<string>();
  const tabs = [gmail, ...stored.filter((tab) => tab.app !== "gmail")].filter(
    (tab) => {
      if (seen.has(tab.id)) {
        return false;
      }

      seen.add(tab.id);

      return true;
    }
  );
  const { selectedTabId } = profile;

  return {
    ...profile,
    tabs,
    selectedTabId:
      selectedTabId !== undefined &&
      knownTabs({ tabs }).some((tab) => tab.id === selectedTabId)
        ? selectedTabId
        : gmail.id,
  };
};

/** A profile with only its Gmail tab. */
export const newProfile = (id: string, name: string): Profile => ({
  id,
  name,
  tabs: [gmailTab()],
  selectedTabId: GMAIL_TAB_ID,
});

export type DecodedState =
  | { kind: "state"; state: State }
  /** A later Meru wrote it; nothing here may read it or write over it. */
  | { kind: "newer"; version: number }
  | { kind: "unreadable"; reason: string };

const readVersion = (value: unknown) =>
  typeof value === "object" && value !== null && "version" in value
    ? value.version
    : undefined;

export const decodeState = (value: unknown): DecodedState => {
  const version = readVersion(value);

  if (Number.isInteger(version) && Number(version) > STATE_VERSION) {
    return { kind: "newer", version: Number(version) };
  }

  const result = stateSchema.safeParse(value);

  return result.success
    ? {
        kind: "state",
        state: {
          ...result.data,
          profiles: result.data.profiles.map(normalizeProfile),
        },
      }
    : { kind: "unreadable", reason: z.prettifyError(result.error) };
};

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
 * and those that are still listed as profiles, as in a hand-edited file,
 * whose data must never be.
 */
export const sortProfilesToClear = (state: State) => {
  const listed = new Set(state.profiles.map((profile) => profile.id));
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
