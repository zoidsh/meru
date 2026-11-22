import { z } from "zod/mini";

import { SEARCH_QUERY_MAX_LENGTH, normalizeQuery } from "./gmail-hash.ts";
import type { State } from "./state.ts";

/** The most searches a profile keeps. */
export const SAVED_SEARCHES_MAX = 100;

/** The longest name a saved search takes, as a profile's. */
const SAVED_SEARCH_LABEL_MAX_LENGTH = 64;

/** How much of a long name a menu shows. */
const SHOWN_NAME_MAX_LENGTH = 60;

const isWellFormed = (value: string) => value.isWellFormed();

// Loose, so a key a later build adds survives this one writing the list.
const savedSearchSchema = z.looseObject({
  id: z.string().check(z.minLength(1)),
  query: z
    .string()
    .check(
      z.minLength(1),
      z.maxLength(SEARCH_QUERY_MAX_LENGTH),
      z.refine(isWellFormed)
    ),
  /** Absent until the person names it; the query stands in for it. */
  label: z.optional(
    z
      .string()
      .check(z.maxLength(SAVED_SEARCH_LABEL_MAX_LENGTH), z.refine(isWellFormed))
  ),
});

export type SavedSearch = z.infer<typeof savedSearchSchema>;

const readable = (entry: unknown) => {
  const parsed = savedSearchSchema.safeParse(entry);

  return parsed.success && normalizeQuery(parsed.data.query)
    ? parsed.data
    : undefined;
};

const stored = (state: State, profileId: string) =>
  state.profiles.find((profile) => profile.id === profileId)?.savedSearches;

/**
 * The profile's saved searches that can be read, in their order. An entry
 * that does not parse, or repeats an earlier one's id, is kept in the file
 * where it was, and not shown; a `savedSearches` that is not a list reads as
 * none and is kept as found.
 */
export const savedSearches = (
  state: State,
  profileId: string
): SavedSearch[] => {
  const entries = stored(state, profileId);

  if (!Array.isArray(entries)) {
    return [];
  }

  const ids = new Set<string>();

  return entries.flatMap((entry: unknown) => {
    const search = readable(entry);

    if (!search || ids.has(search.id)) {
      return [];
    }

    ids.add(search.id);

    return [search];
  });
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
 * Why a search cannot be added: no query, one the profile has already
 * (compared after trimming, as Gmail's own text), a list at its most, or
 * a query, name or list this build cannot write.
 */
export type SavedSearchRefusal = "empty" | "duplicate" | "full" | "unwritable";

/**
 * A saved search's name as typed, without control characters and trimmed,
 * as a profile's is; `""` when it is empty and nothing when it is too long
 * or not well formed.
 */
const cleanName = (name: string) => {
  const cleaned = name.replaceAll(/\p{Cc}/gu, "").trim();

  return cleaned.length <= SAVED_SEARCH_LABEL_MAX_LENGTH &&
    cleaned.isWellFormed()
    ? cleaned
    : undefined;
};

/** Why `query` cannot be added to the profile's searches, if it cannot. */
export const savedSearchRefusal = (
  state: State,
  profileId: string,
  query: string
): SavedSearchRefusal | undefined => {
  if (query.trim() === "") {
    return "empty";
  }

  const normalized = normalizeQuery(query);
  const entries = stored(state, profileId);

  if (
    normalized === undefined ||
    !state.profiles.some((profile) => profile.id === profileId) ||
    !(entries === undefined || Array.isArray(entries))
  ) {
    return "unwritable";
  }

  const searches = savedSearches(state, profileId);

  if (searches.some((search) => search.query.trim() === normalized)) {
    return "duplicate";
  }

  return searches.length < SAVED_SEARCHES_MAX ? undefined : "full";
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

/**
 * The profile's searches with `query` added last, trimmed, named `name`
 * when one is given that is not empty; else why it cannot be added.
 */
export const addSavedSearch = (
  state: State,
  profileId: string,
  { query, name = "" }: { query: string; name?: string | undefined },
  newId: () => string
): { state: State } | { refused: SavedSearchRefusal } => {
  const refused = savedSearchRefusal(state, profileId, query);
  const label = cleanName(name);

  if (refused) {
    return { refused };
  }

  if (label === undefined) {
    return { refused: "unwritable" };
  }

  return {
    state: withSearches(state, profileId, (entries) => [
      ...entries,
      { id: newId(), query: query.trim(), ...(label && { label }) },
    ]),
  };
};

/**
 * The profile's search whose id is `searchId` named `name`, an empty one
 * clearing its name so the query stands in. Nothing when there is no such
 * search shown, the name cannot be written or is the one it has.
 */
export const renameSavedSearch = (
  state: State,
  profileId: string,
  searchId: string,
  name: string
): State | undefined => {
  const label = cleanName(name);
  const search = savedSearches(state, profileId).find(
    (candidate) => candidate.id === searchId
  );

  if (!search || label === undefined || label === (search.label ?? "")) {
    return;
  }

  return withSearches(state, profileId, (entries) => {
    const index = entries.findIndex(
      (entry) => readable(entry)?.id === searchId
    );

    return entries.map((entry, at) => {
      if (at !== index) {
        return entry;
      }

      const { label: _old, ...rest } = entry as SavedSearch;

      return label ? { ...rest, label } : rest;
    });
  });
};

/**
 * Without the profile's search whose id is `searchId`, the one shown: a later
 * entry repeating its id, and entries that do not parse, stay where they
 * were. Nothing when there is none to remove.
 */
export const removeSavedSearch = (
  state: State,
  profileId: string,
  searchId: string
): State | undefined =>
  savedSearches(state, profileId).some((search) => search.id === searchId)
    ? withSearches(state, profileId, (entries) => {
        const index = entries.findIndex(
          (entry) => readable(entry)?.id === searchId
        );

        return entries.filter((_, at) => at !== index);
      })
    : undefined;
