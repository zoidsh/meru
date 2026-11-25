import {
  EMAIL_TRACKER_PATTERNS,
  EMAIL_TRACKER_SUBSTRINGS,
  EXTRA_EMAIL_TRACKER_PATTERNS,
  EXTRA_EMAIL_TRACKER_SUBSTRINGS,
  GOOGLE_AD_HOSTS,
  GOOGLE_TELEMETRY_PATHS,
  GOOGLE_TRACKER_HOSTS,
} from "./blocker-list.ts";

/** What the blocker stops; with neither, nothing. */
export interface BlockChoice {
  ads: boolean;
  trackers: boolean;
}

/** A request as the session reports it. */
export interface BlockAsk {
  /** With its fragment, where Gmail's image proxy keeps the image's own URL. */
  url: string;
  /** Electron's, such as `mainFrame`, `image` or `script`. */
  resourceType: string;
}

const escapeRegExp = (value: string) =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

/**
 * A host or any subdomain of it, only where it ends at a label, so neither a
 * look-alike such as `evildoubleclick.net` nor the name in a path matches. A
 * host after a fragment's `://` matches too, which is how a proxied image is
 * caught by its own URL.
 */
const hostPattern = (hosts: readonly string[]) =>
  new RegExp(
    String.raw`://(?:[a-z0-9-]+\.)*(?:${hosts.map(escapeRegExp).join("|")})(?=[:/?#]|$)`,
    "u"
  );

/** One alternation of literals, which V8 can prefilter as a whole. */
const literalPattern = (literals: readonly string[]) =>
  new RegExp(literals.map(escapeRegExp).join("|"), "u");

/**
 * Whether a request is stopped, or `undefined` when nothing is, so a session
 * needs no hook at all. Ads are Google's ad hosts; trackers are Google's
 * tracker hosts, its telemetry paths and email open-tracking pixels, so the
 * two are independent. Never stopped, whatever the list says: a `mainFrame`
 * request, since it is a page the person goes to or a download they start,
 * and a request to one of `protectedOrigins`, Google's sign-in.
 */
export const createBlockMatcher = (
  { ads, trackers }: BlockChoice,
  protectedOrigins: readonly string[]
): ((ask: BlockAsk) => boolean) | undefined => {
  const patterns: RegExp[] = [];
  const hosts = [
    ...(ads ? GOOGLE_AD_HOSTS : []),
    ...(trackers ? GOOGLE_TRACKER_HOSTS : []),
  ];

  if (hosts.length > 0) {
    patterns.push(hostPattern(hosts));
  }

  if (trackers) {
    patterns.push(
      literalPattern([
        ...GOOGLE_TELEMETRY_PATHS,
        ...EMAIL_TRACKER_SUBSTRINGS,
        ...EXTRA_EMAIL_TRACKER_SUBSTRINGS,
      ]),
      new RegExp(
        [...EMAIL_TRACKER_PATTERNS, ...EXTRA_EMAIL_TRACKER_PATTERNS].join("|"),
        "u"
      )
    );
  }

  if (patterns.length === 0) {
    return undefined;
  }

  const isProtected = (url: string) =>
    protectedOrigins.some(
      (origin) =>
        url.startsWith(origin) && /^(?:[/?#]|$)/u.test(url.slice(origin.length))
    );

  return ({ url, resourceType }) =>
    resourceType !== "mainFrame" &&
    !isProtected(url) &&
    patterns.some((pattern) => pattern.test(url));
};
