import { z } from "zod/mini";

export const STATE_VERSION = 1;

/** What v3 names its first account; kept in English and translated when shown. */
export const DEFAULT_PROFILE_NAME = "Default";

const profileSchema = z.object({
  id: z.string().check(z.minLength(1)),
  name: z.string(),
});

const stateSchema = z
  .object({
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

export const selectedProfile = (state: State): Profile => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === state.selectedProfileId
  );

  if (!profile) {
    throw new Error("The state holds no selected profile");
  }

  return profile;
};
