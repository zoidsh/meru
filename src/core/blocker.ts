import { escapeRegExp } from "es-toolkit";

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

/**
 * How much of a URL's host, path and query the list's text entries are
 * matched against. Every entry names a host and the start of a path, so a
 * tracker's marker ends within the first couple of hundred characters; the
 * rest is a sender's to make as long as they like, and a regular expression
 * over it costs time that grows faster than its length.
 */
const MATCHED_TEXT_LENGTH = 512;

/**
 * No DNS name is longer, so a longer hostname names no host on the list,
 * and walking its labels would cost time that grows with the square of its
 * length.
 */
const MAX_HOSTNAME_LENGTH = 253;

/**
 * A list entry as a regular expression. One that starts with a character
 * class repeated, `[…]+`, matches a string whenever the class alone does,
 * if at a later index, since the match is not anchored, and only `test` is
 * asked of it; alone, it no longer runs to the end of a long run of that
 * class from every position in it.
 */
const compilePattern = (pattern: string) =>
  new RegExp(
    pattern.replace(/^(?<repeated>\[[^\]]+\])\+/u, "$<repeated>"),
    "u"
  );

/** The host, or any host it is a subdomain of, is in `hosts`. */
const onHost = (hostname: string, hosts: ReadonlySet<string>) => {
  if (hostname.length > MAX_HOSTNAME_LENGTH + 1) {
    return false;
  }

  let suffix = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;

  for (;;) {
    if (hosts.has(suffix)) {
      return true;
    }

    const dot = suffix.indexOf(".");

    if (dot === -1) {
      return false;
    }

    suffix = suffix.slice(dot + 1);
  }
};

/** The URL Gmail's image proxy carries after `#`, where there is one. */
const carriedUrl = ({ hash }: URL) =>
  hash.startsWith("#http") ? URL.parse(hash.slice(1)) : null;

/** What the text entries see of a URL: from its host to its query, bounded. */
const matchedText = ({ host, pathname, search }: URL) =>
  `${host}${pathname}${search}`.slice(0, MATCHED_TEXT_LENGTH);

/**
 * Whether a request is stopped, or `undefined` when nothing is, so a session
 * needs no hook at all. Ads are Google's ad hosts; trackers are Google's
 * tracker hosts, its telemetry paths and email open-tracking pixels, so the
 * two are independent. A pixel behind Gmail's image proxy is judged by the
 * URL the proxy carries too. Never stopped, whatever the list says: a
 * `mainFrame` request, since it is a page the person goes to or a download
 * they start; a request to one of `protectedOrigins`, Google's sign-in; and
 * a URL that does not parse.
 */
export const createBlockMatcher = (
  { ads, trackers }: BlockChoice,
  protectedOrigins: readonly string[]
): ((ask: BlockAsk) => boolean) | undefined => {
  if (!ads && !trackers) {
    return undefined;
  }

  const hosts = new Set([
    ...(ads ? GOOGLE_AD_HOSTS : []),
    ...(trackers ? GOOGLE_TRACKER_HOSTS : []),
  ]);
  const text = trackers
    ? [
        new RegExp(
          [
            ...GOOGLE_TELEMETRY_PATHS,
            ...EMAIL_TRACKER_SUBSTRINGS,
            ...EXTRA_EMAIL_TRACKER_SUBSTRINGS,
          ]
            .map(escapeRegExp)
            .join("|"),
          "u"
        ),
        ...[...EMAIL_TRACKER_PATTERNS, ...EXTRA_EMAIL_TRACKER_PATTERNS].map(
          compilePattern
        ),
      ]
    : [];
  const protectedSet = new Set(protectedOrigins);

  const blocks = (url: URL) => {
    if (onHost(url.hostname, hosts)) {
      return true;
    }

    const matched = matchedText(url);

    return text.some((pattern) => pattern.test(matched));
  };

  return ({ url, resourceType }) => {
    if (resourceType === "mainFrame") {
      return false;
    }

    const parsed = URL.parse(url);

    if (!parsed || protectedSet.has(parsed.origin)) {
      return false;
    }

    const carried = carriedUrl(parsed);

    return blocks(parsed) || (carried !== null && blocks(carried));
  };
};
