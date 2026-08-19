/**
 * `web_accessible_resources` entries: plain path patterns in manifest v2, and
 * objects carrying them in v3. Who a v3 entry exposes its resources to does not
 * matter here — see `findWebAccessiblePattern`.
 */
export type WebAccessibleResources = (
  | string
  | { [entryKey: string]: unknown; resources?: string[] }
)[];

function escapeRegExp(literal: string) {
  return literal.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Chrome matches a resource pattern against the resource's path from the
 * extension root, with `*` standing for any run of characters, separators
 * included. A leading slash spells the same root-relative path.
 */
function matchesResourcePattern(pattern: string, fileName: string) {
  const normalizedPattern = pattern.replace(/^\//, "");

  const patternRegExp = new RegExp(
    `^${normalizedPattern.split("*").map(escapeRegExp).join(".*")}$`,
  );

  return patternRegExp.test(fileName);
}

/**
 * The first pattern that lets a resource the derive wrote be fetched from
 * outside the extension, or nothing.
 *
 * The facade copy carries the bridge token, and `web_accessible_resources` is
 * the one manifest key that would hand it out: a pattern covering the facade —
 * `*.js`, say — makes it fetchable by every page in the session, and the token
 * with it. An entry that names `extension_ids` instead of `matches`, or asks
 * for a dynamic URL, still counts: what those narrow it to is Chromium's to
 * enforce and Electron's support for them is unmeasured, and a token must not
 * ride on either.
 */
export function findWebAccessiblePattern(
  webAccessibleResources: WebAccessibleResources | undefined,
  fileName: string,
) {
  if (!Array.isArray(webAccessibleResources)) {
    return undefined;
  }

  for (const entry of webAccessibleResources) {
    const patterns = typeof entry === "string" ? [entry] : (entry.resources ?? []);

    for (const pattern of patterns) {
      if (typeof pattern === "string" && matchesResourcePattern(pattern, fileName)) {
        return pattern;
      }
    }
  }

  return undefined;
}
