import { z } from "zod/mini";

import { SEARCH_QUERY_MAX_LENGTH, normalizeQuery } from "./gmail-hash.ts";
import type { State } from "./state.ts";

/** The most searches a profile keeps. */
export const SAVED_SEARCHES_MAX = 100;

/** The longest name a saved search takes, as a profile's. */
export const SAVED_SEARCH_LABEL_MAX_LENGTH = 64;

/** How much of a long name a menu shows. */
const SHOWN_NAME_MAX_LENGTH = 60;

// Loose, so a key a later build adds survives this one writing the list.
const savedSearchSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  query: z.string().check(z.minLength(1), z.maxLength(SEARCH_QUERY_MAX_LENGTH)),
  /** Absent until the person names it; the query stands in for it. */
  label: z.optional(
    z.string().check(z.maxLength(SAVED_SEARCH_LABEL_MAX_LENGTH))
  ),
});

export type SavedSearch = z.infer<typeof savedSearchSchema>;

const stored = (state: State, profileId: string) =>
  state.profiles.find((profile) => profile.id === profileId)?.savedSearches;

/**
 * The profile's saved searches that can be read, in their order. An entry
 * that does not parse is kept in the file where it was, and not shown; a
 * `savedSearches` that is not a list reads as none and is kept as found.
 */
export const savedSearches = (
  state: State,
  profileId: string
): SavedSearch[] => {
  const entries = stored(state, profileId);

  return Array.isArray(entries)
    ? entries.flatMap((entry: unknown) => {
        const parsed = savedSearchSchema.safeParse(entry);

        return parsed.success && normalizeQuery(parsed.data.query)
          ? [parsed.data]
          : [];
      })
    : [];
};

/** What a menu shows for the search: its name, else its query, cut short. */
export const savedSearchName = ({ label, query }: SavedSearch) => {
  const name = label?.trim() || query.trim();
  const characters = [...name];

  return characters.length > SHOWN_NAME_MAX_LENGTH
    ? `${characters.slice(0, SHOWN_NAME_MAX_LENGTH - 1).join("")}…`
    : name;
};

/**
 * Whether `query` can be saved for the profile: it is a query a saved search
 * holds, none of the profile's has it already, there is room, and the list in
 * the file is one this build can add to.
 */
export const canSaveSearch = (
  state: State,
  profileId: string,
  query: string
) => {
  const normalized = normalizeQuery(query);
  const entries = stored(state, profileId);
  const searches = savedSearches(state, profileId);

  return (
    normalized !== undefined &&
    state.profiles.some((profile) => profile.id === profileId) &&
    (entries === undefined || Array.isArray(entries)) &&
    searches.length < SAVED_SEARCHES_MAX &&
    !searches.some((search) => search.query.trim() === normalized)
  );
};

const withSearches = (
  state: State,
  profileId: string,
  change: (entries: unknown[]) => unknown[]
): State => ({
  ...state,
  profiles: state.profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile;
    }

    const entries = profile.savedSearches;

    return {
      ...profile,
      savedSearches: change(Array.isArray(entries) ? entries : []),
    };
  }),
});

/** The search saved last, unnamed; nothing when it cannot be saved. */
export const saveSearch = (
  state: State,
  profileId: string,
  query: string,
  newId: () => string
): State | undefined => {
  const normalized = normalizeQuery(query);

  return normalized !== undefined && canSaveSearch(state, profileId, query)
    ? withSearches(state, profileId, (entries) => [
        ...entries,
        { id: newId(), query: normalized },
      ])
    : undefined;
};

/**
 * Without the profile's searches whose id is `searchId`; entries that do not
 * parse stay where they were. Nothing when there is none to remove.
 */
export const removeSavedSearch = (
  state: State,
  profileId: string,
  searchId: string
): State | undefined =>
  savedSearches(state, profileId).some((search) => search.id === searchId)
    ? withSearches(state, profileId, (entries) =>
        entries.filter((entry) => {
          const parsed = savedSearchSchema.safeParse(entry);

          return !parsed.success || parsed.data.id !== searchId;
        })
      )
    : undefined;
