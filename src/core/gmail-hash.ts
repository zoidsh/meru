/** Where Gmail's page goes by its location's hash. */
export const COMPOSE_HASH = "#compose";

export const SETTINGS_HASH = "#settings";

/** The longest hash main sends a page, and a page takes. */
export const GMAIL_HASH_MAX_LENGTH = 2048;

/** The longest query a saved search holds. */
export const SEARCH_QUERY_MAX_LENGTH = 1000;

const SEARCH_PREFIX = "#search/";

/** What main may send Gmail's page to go to, as the page checks it too. */
export const isGmailHash = (value: unknown): value is string =>
  typeof value === "string" &&
  value.startsWith("#") &&
  value.length <= GMAIL_HASH_MAX_LENGTH;

/**
 * The hash of Gmail's search for `query`, as one encoded segment: a quote,
 * a slash, `#`, `&` or `+` in it stays the query's, never the hash's. A
 * space is `%20`, which Gmail reads as its own `+`.
 */
export const searchHash = (query: string) =>
  `${SEARCH_PREFIX}${encodeURIComponent(query)}`;

/**
 * A query as a saved search keeps it: trimmed, and neither empty nor longer
 * than a saved search holds.
 */
export const normalizeQuery = (query: string) => {
  const trimmed = query.trim();

  return trimmed.length > 0 && trimmed.length <= SEARCH_QUERY_MAX_LENGTH
    ? trimmed
    : undefined;
};

/**
 * The query of the search a Gmail page at `url` shows, read from its hash as
 * Gmail writes it (`+` for a space, the rest percent-encoded), with any
 * message opened from it or parameter after it left off; nothing when the
 * page shows no search or the hash does not decode.
 */
export const searchQueryOf = (url: string) => {
  let hash: string;

  try {
    ({ hash } = new URL(url));
  } catch {
    return;
  }

  if (!hash.startsWith(SEARCH_PREFIX)) {
    return;
  }

  const [segment = ""] = hash.slice(SEARCH_PREFIX.length).split(/[/?]/u, 1);

  try {
    return normalizeQuery(decodeURIComponent(segment.replaceAll("+", " ")));
  } catch {
    // A malformed escape, which no search of Gmail's writes.
  }
};
