import { z } from "zod/mini";

export const STATE_VERSION = 1;

/** What v3 names its first account; kept in English and translated when shown. */
export const DEFAULT_PROFILE_NAME = "Default";

// Loose at both levels: a key a later build added on the same version, as a
// Beta may, survives this build rewriting the file.
const profileSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  name: z.string(),
});

const stateSchema = z
  .looseObject({
    version: z.literal(STATE_VERSION),
    profiles: z.array(profileSchema).check(z.minLength(1)),
    selectedProfileId: z.string(),
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

export type Profile = z.infer<typeof profileSchema>;

export type State = z.infer<typeof stateSchema>;

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
    ? { kind: "state", state: result.data }
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
    profiles: [{ id, name: DEFAULT_PROFILE_NAME }],
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

/** Nothing when there is no such profile. */
export const selectProfile = (
  state: State,
  profileId: string
): State | undefined =>
  state.profiles.some((profile) => profile.id === profileId)
    ? { ...state, selectedProfileId: profileId }
    : undefined;

export const canRemoveProfile = (state: State) => state.profiles.length > 1;

/**
 * Removing the selected profile selects the one to its right, or to its left
 * when it was the last; removing another leaves the selection alone. Nothing
 * when there is no such profile or it is the only one.
 */
export const removeProfile = (
  state: State,
  profileId: string
): State | undefined => {
  const index = state.profiles.findIndex((profile) => profile.id === profileId);

  if (index === -1 || !canRemoveProfile(state)) {
    return;
  }

  const profiles = state.profiles.filter((_, other) => other !== index);
  const neighbour = profiles[Math.min(index, profiles.length - 1)];

  return {
    ...state,
    profiles,
    selectedProfileId:
      state.selectedProfileId === profileId && neighbour
        ? neighbour.id
        : state.selectedProfileId,
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
