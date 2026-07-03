import { EMAIL_TRACKERS } from "./trackers";

// Google ad/tracker hostnames and telemetry paths harvested from EasyList and
// EasyPrivacy — the only list rules that fire against the Gmail traffic Meru renders.

const GOOGLE_AD_HOSTS = [
  "doubleclick.net",
  "doubleclick.com",
  "googlesyndication.com",
  "googleadservices.com",
  "googletagservices.com",
  "2mdn.net",
  "admob.com",
  "adtrafficquality.google",
  "mail-ads.google.com",
];

const GOOGLE_TRACKER_HOSTS = [
  "google-analytics.com",
  "googletagmanager.com",
  "getgoogletagmanager.com",
];

const GOOGLE_TELEMETRY_PATTERNS = [
  "generate_204",
  "gen_204",
  "csi_204",
  "client_204",
  "play.google.com/log",
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createHostPattern(hosts: string[]) {
  // Match a blocked host only at a hostname label boundary in the URL authority,
  // so paths and lookalike hosts (e.g. evildoubleclick.net) never match.
  return new RegExp(`://(?:[a-z0-9-]+\\.)*(?:${hosts.map(escapeRegExp).join("|")})(?=[:/?#]|$)`);
}

// A pattern with an unbounded quantifier defeats V8's regexp prefilter and forces a
// full backtracking scan of every alternative. Splitting these off keeps the literal
// patterns on the fast path — matching the same URLs an order of magnitude faster.
function hasUnboundedQuantifier(pattern: string) {
  return /[*+{]/.test(pattern);
}

export function createBlockMatcher({ ads, tracking }: { ads: boolean; tracking: boolean }) {
  const patterns: RegExp[] = [];

  const hosts = [...(ads ? GOOGLE_AD_HOSTS : []), ...(tracking ? GOOGLE_TRACKER_HOSTS : [])];

  if (hosts.length) {
    patterns.push(createHostPattern(hosts));
  }

  if (tracking) {
    const literal = [
      ...GOOGLE_TELEMETRY_PATTERNS.map(escapeRegExp),
      ...EMAIL_TRACKERS.filter((pattern) => !hasUnboundedQuantifier(pattern)),
    ];

    patterns.push(new RegExp(literal.join("|")));
    patterns.push(new RegExp(EMAIL_TRACKERS.filter(hasUnboundedQuantifier).join("|")));
  }

  if (!patterns.length) {
    return;
  }

  return (url: string) => {
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        return true;
      }
    }

    return false;
  };
}
