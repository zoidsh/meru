import { getWorkspaceAppFromUrl } from "@meru/shared/google";

export const MERU_PROTOCOL = "meru";

const MERU_URL_PREFIX = `${MERU_PROTOCOL}://`;

/**
 * A `meru://` URL that resolved to something the app knows how to carry out.
 * The address is optional on the open route and required on the message route,
 * which is what tells `meru://open?url=…` apart from `meru://<email>/open?url=…`.
 */
export type MeruDeepLink =
  | { type: "message"; email: string; messageId: string }
  | { type: "open"; url: string; email: string | undefined };

export function isMeruUrl(url: string) {
  return url.startsWith(MERU_URL_PREFIX);
}

export function createMeruMessageUrl(userEmail: string, messageId: string) {
  return `${MERU_URL_PREFIX}${userEmail}/message/${messageId}`;
}

/**
 * Deliberately hand-parsed rather than handed to `new URL`. `meru:` is not a
 * special scheme, so the parser reads the address as userinfo and splits
 * `meru://someone@gmail.com/message/x` into a username and a host that have to
 * be glued back together. The query is a genuine query string, so that half
 * does go through `URLSearchParams`.
 */
export function parseMeruUrl(url: string): MeruDeepLink | undefined {
  if (!isMeruUrl(url)) {
    return undefined;
  }

  const body = url.slice(MERU_URL_PREFIX.length);

  const queryIndex = body.indexOf("?");

  const pathname = queryIndex === -1 ? body : body.slice(0, queryIndex);

  const searchParams = new URLSearchParams(queryIndex === -1 ? "" : body.slice(queryIndex + 1));

  const segments = pathname.split("/");

  // An address is the only segment that can carry an "@", so it is what says
  // whether the route name is the first segment or the second.
  const email = segments[0]?.includes("@") ? segments[0] : undefined;

  const [route, argument] = email ? [segments[1], segments[2]] : [segments[0], segments[1]];

  if (route === "open") {
    const openedUrl = searchParams.get("url");

    if (!openedUrl) {
      return undefined;
    }

    return { type: "open", url: openedUrl, email };
  }

  // Addressed to nobody, a message id resolves to no account, so the route
  // needs the address the open route can do without.
  if (route === "message" && email && argument) {
    return { type: "message", email, messageId: argument };
  }

  return undefined;
}

const GOOGLE_HOSTNAME = "google.com";

function isGoogleHostname(hostname: string) {
  return hostname === GOOGLE_HOSTNAME || hostname.endsWith(`.${GOOGLE_HOSTNAME}`);
}

/**
 * The URL a deep link asked for, when the app may open it in one of its own
 * views, and undefined otherwise.
 *
 * A `meru://` URL is reachable from any page and any message, so this is an
 * untrusted entry point and neither check below is optional.
 * `getWorkspaceAppFromUrl` matches a substring rather than a host, so it alone
 * resolves `https://evil.com/meet.google.com/x` to Meet; and `Tabs.openUrl`
 * asks `canOpenWorkspaceAppInApp`, which answers true for a URL belonging to no
 * workspace app at all. The host is parsed and verified first, and only then is
 * the matcher asked which app it belongs to.
 */
export function resolveRoutableUrl(rawUrl: string): string | undefined {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return undefined;
  }

  if (parsedUrl.protocol !== "https:") {
    return undefined;
  }

  // Credentials in the authority are never something a link router meant to
  // send, and they are how a lookalike host gets read as a real one.
  if (parsedUrl.username || parsedUrl.password) {
    return undefined;
  }

  if (!isGoogleHostname(parsedUrl.hostname)) {
    return undefined;
  }

  if (!getWorkspaceAppFromUrl(parsedUrl.href)) {
    return undefined;
  }

  return parsedUrl.href;
}
