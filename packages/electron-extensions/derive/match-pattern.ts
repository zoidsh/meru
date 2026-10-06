/**
 * Chrome match patterns: the sites a clamp names and whether a content script
 * could ever have run on one of them, and whether a pattern reaches a concrete
 * URL.
 *
 * The clamp is a host allowlist: the catalog names the sites an extension is
 * offered for, and the derive writes them over every content script's own
 * patterns. So the question `reachesClampedSite` asks is about scheme and host,
 * never path — a content script restricted to a path within an allowed host
 * keeps running on that host, which is what the clamp already does to every
 * entry it rewrites.
 *
 * `matchesUrl` is the other question, pattern against a URL, which is what
 * `chrome.tabs.query({url})` filters on (`runtime-proxy/worker-tabs.ts`); there
 * the path is part of the answer, since an extension may well ask for one.
 */

const ALL_URLS = "<all_urls>";

type MatchPattern = {
  scheme: string;
  host: string;
  /** Everything from the host's trailing slash on, `"/"` where there is none. */
  path: string;
};

/**
 * The schemes `*` stands for in a match pattern's scheme position, which is
 * `http` and `https` alone — not the `file` and `ftp` schemes a bare `*` covers
 * nowhere in Chrome's grammar.
 */
const WILDCARD_SCHEMES = new Set(["http", "https"]);

function parseMatchPattern(pattern: string): MatchPattern | undefined {
  const separatorIndex = pattern.indexOf("://");

  if (separatorIndex === -1) {
    return undefined;
  }

  const scheme = pattern.slice(0, separatorIndex);

  const afterScheme = pattern.slice(separatorIndex + "://".length);

  const pathIndex = afterScheme.indexOf("/");

  return {
    scheme,
    host: pathIndex === -1 ? afterScheme : afterScheme.slice(0, pathIndex),
    path: pathIndex === -1 ? "/" : afterScheme.slice(pathIndex),
  };
}

function schemeCovers(patternScheme: string, siteScheme: string) {
  if (patternScheme === "*") {
    return WILDCARD_SCHEMES.has(siteScheme);
  }

  return patternScheme === siteScheme;
}

function hostCovers(patternHost: string, siteHost: string) {
  if (patternHost === "*") {
    return true;
  }

  if (patternHost.startsWith("*.")) {
    const suffix = patternHost.slice("*.".length);

    return siteHost === suffix || siteHost.endsWith(`.${suffix}`);
  }

  return patternHost === siteHost;
}

/**
 * Whether a content script's own match pattern reaches the site a clamp pattern
 * names. A clamp pattern naming a wildcard host has no single site to ask
 * about, so it is taken as reaching everything rather than guessed at.
 */
export function reachesClampedSite(contentScriptPattern: string, clampPattern: string) {
  if (contentScriptPattern === ALL_URLS || clampPattern === ALL_URLS) {
    return true;
  }

  const clampedSite = parseMatchPattern(clampPattern);

  if (!clampedSite || clampedSite.host.includes("*")) {
    return true;
  }

  const contentScriptSites = parseMatchPattern(contentScriptPattern);

  if (!contentScriptSites) {
    return false;
  }

  return (
    schemeCovers(contentScriptSites.scheme, clampedSite.scheme) &&
    hostCovers(contentScriptSites.host, clampedSite.host)
  );
}

/**
 * The schemes `<all_urls>` stands for, which is Chrome's own list rather than
 * the two a bare `*` covers.
 */
const ALL_URLS_SCHEMES = new Set(["http", "https", "file", "ftp"]);

/**
 * Whether a match pattern's path reaches a URL's. Chrome's path grammar has one
 * wildcard, `*`, standing for any run of characters, and the pattern is matched
 * against the URL's path *and* query — `https://example.com/a?b=c` is reached by
 * `https://example.com/a*` and not by `https://example.com/a`.
 */
function pathCovers(patternPath: string, urlPath: string) {
  const expression = patternPath
    .split("*")
    .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${expression}$`).test(urlPath);
}

/**
 * Whether a match pattern reaches a concrete URL — scheme, host and path, the
 * whole grammar rather than the clamp's scheme-and-host question.
 *
 * A URL `URL` cannot parse reaches nothing: an extension's pattern is a claim
 * about a page, and a string that names no page is not one. `<all_urls>` is
 * Chrome's own shorthand for every permitted scheme, which is where it differs
 * from a wildcard scheme, covering `http` and `https` alone.
 */
export function matchesUrl(pattern: string, url: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  const scheme = parsedUrl.protocol.slice(0, -":".length);

  if (pattern === ALL_URLS) {
    return ALL_URLS_SCHEMES.has(scheme);
  }

  const parsedPattern = parseMatchPattern(pattern);

  if (!parsedPattern) {
    return false;
  }

  // Chrome lowercases a pattern's scheme and host as it parses one, as `URL`
  // does a URL's; the path stays case-sensitive on both sides
  return (
    schemeCovers(parsedPattern.scheme.toLowerCase(), scheme) &&
    hostCovers(parsedPattern.host.toLowerCase(), parsedUrl.hostname) &&
    pathCovers(parsedPattern.path, `${parsedUrl.pathname}${parsedUrl.search}`)
  );
}
