/**
 * Chrome's `events.UrlFilter`, which `webNavigation` listeners are registered
 * with. Every criterion a filter names has to hold for it to match.
 */
export type UrlFilter = {
  hostContains?: string;
  hostEquals?: string;
  hostPrefix?: string;
  hostSuffix?: string;
  pathContains?: string;
  pathEquals?: string;
  pathPrefix?: string;
  pathSuffix?: string;
  queryContains?: string;
  queryEquals?: string;
  queryPrefix?: string;
  querySuffix?: string;
  urlContains?: string;
  urlEquals?: string;
  urlMatches?: string;
  originAndPathMatches?: string;
  urlPrefix?: string;
  urlSuffix?: string;
  schemes?: string[];
  ports?: (number | [number, number])[];
  cidrBlocks?: string[];
};

const DEFAULT_PORTS: Record<string, number> = {
  "http:": 80,
  "https:": 443,
  "ws:": 80,
  "wss:": 443,
  "ftp:": 21,
};

function matchesString(
  value: string,
  criterion: unknown,
  test: (value: string, criterion: string) => boolean,
) {
  return criterion === undefined || (typeof criterion === "string" && test(value, criterion));
}

function matchesRegExp(value: string, pattern: unknown) {
  if (pattern === undefined) {
    return true;
  }

  if (typeof pattern !== "string") {
    return false;
  }

  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

function matchesPort(port: number, ports: unknown) {
  if (ports === undefined) {
    return true;
  }

  if (!Array.isArray(ports)) {
    return false;
  }

  return ports.some((entry) =>
    Array.isArray(entry) ? port >= entry[0] && port <= entry[1] : port === entry,
  );
}

const contains = (value: string, criterion: string) => value.includes(criterion);
const equals = (value: string, criterion: string) => value === criterion;
const startsWith = (value: string, criterion: string) => value.startsWith(criterion);
const endsWith = (value: string, criterion: string) => value.endsWith(criterion);

/**
 * Whether one filter matches, compared as Chrome's URL matcher does: against
 * the canonical URL without its fragment and with a default port left out,
 * hosts lowercased, and `hostContains` against the host with a dot in front,
 * so `.example` matches `www.example.com` and `example.com` alike.
 *
 * `urlMatches` and `originAndPathMatches` are RE2 in Chrome and a JavaScript
 * regular expression here, which agree on everything an extension writes in
 * practice. `cidrBlocks` is not supported, and a filter naming it matches
 * nothing rather than more than Chrome would.
 */
export function matchesUrlFilter(url: string, filter: UrlFilter) {
  const parsed = URL.parse(url);

  if (!parsed || filter.cidrBlocks !== undefined) {
    return false;
  }

  parsed.hash = "";

  const host = parsed.hostname;

  const query = parsed.search.slice(1);

  const scheme = parsed.protocol.slice(0, -1);

  const port = parsed.port === "" ? DEFAULT_PORTS[parsed.protocol] : Number(parsed.port);

  const urlWithoutFragment = parsed.href;

  parsed.search = "";

  const urlWithoutQuery = parsed.href;

  const lower = (criterion: unknown) =>
    typeof criterion === "string" ? criterion.toLowerCase() : criterion;

  return (
    matchesString(`.${host}`, lower(filter.hostContains), contains) &&
    matchesString(host, lower(filter.hostEquals), equals) &&
    matchesString(host, lower(filter.hostPrefix), startsWith) &&
    matchesString(host, lower(filter.hostSuffix), endsWith) &&
    matchesString(parsed.pathname, filter.pathContains, contains) &&
    matchesString(parsed.pathname, filter.pathEquals, equals) &&
    matchesString(parsed.pathname, filter.pathPrefix, startsWith) &&
    matchesString(parsed.pathname, filter.pathSuffix, endsWith) &&
    matchesString(query, filter.queryContains, contains) &&
    matchesString(query, filter.queryEquals, equals) &&
    matchesString(query, filter.queryPrefix, startsWith) &&
    matchesString(query, filter.querySuffix, endsWith) &&
    matchesString(urlWithoutFragment, filter.urlContains, contains) &&
    matchesString(urlWithoutFragment, filter.urlEquals, equals) &&
    matchesString(urlWithoutFragment, filter.urlPrefix, startsWith) &&
    matchesString(urlWithoutFragment, filter.urlSuffix, endsWith) &&
    matchesRegExp(urlWithoutFragment, filter.urlMatches) &&
    matchesRegExp(urlWithoutQuery, filter.originAndPathMatches) &&
    (filter.schemes === undefined ||
      (Array.isArray(filter.schemes) && filter.schemes.includes(scheme))) &&
    (filter.ports === undefined || (port !== undefined && matchesPort(port, filter.ports)))
  );
}

/**
 * Whether an event for `url` reaches a listener registered with `filters`, the
 * listener's second argument. No filters, or no `url` list in them, or an
 * empty one, matches every URL, as in Chrome; otherwise any one filter
 * matching is enough.
 */
export function matchesEventFilters(url: string, filters: unknown) {
  const urlFilters = (filters as { url?: unknown } | undefined)?.url;

  if (!Array.isArray(urlFilters) || urlFilters.length === 0) {
    return true;
  }

  return urlFilters.some(
    (filter) =>
      typeof filter === "object" && filter !== null && matchesUrlFilter(url, filter as UrlFilter),
  );
}
