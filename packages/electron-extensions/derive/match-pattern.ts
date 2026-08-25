/**
 * The sites a clamp names, and whether a content script could ever have run on
 * one of them.
 *
 * The clamp is a host allowlist: the catalog names the sites an extension is
 * offered for, and the derive writes them over every content script's own
 * patterns. So the question asked here is about scheme and host, never path — a
 * content script restricted to a path within an allowed host keeps running on
 * that host, which is what the clamp already does to every entry it rewrites.
 */

const ALL_URLS = "<all_urls>";

type MatchPattern = {
  scheme: string;
  host: string;
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
