/** Far longer than any real link; a longer one is refused rather than handed to Gmail. */
export const MAILTO_MAX_LENGTH = 8192;

// oxlint-disable-next-line no-control-regex -- control characters are what it finds
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u;

// Two letters at least, so a Windows path's drive letter is no scheme.
const SCHEME = /^(?<scheme>[a-z][\d+.a-z-]+):/iu;

/**
 * Whether `url` is a `mailto:` link Meru composes, as the system hands it
 * over. Nothing past the scheme is read: Gmail fills the fields from it.
 */
export const isMailtoUrl = (url: string) =>
  url.length <= MAILTO_MAX_LENGTH &&
  url.slice(0, "mailto:".length).toLowerCase() === "mailto:" &&
  !CONTROL_CHARACTERS.test(url);

/**
 * The scheme of an incoming URL, lowercased, for a log line that must not
 * name the URL; "none" when it has none.
 */
export const schemeOf = (url: string) =>
  SCHEME.exec(url)?.groups?.scheme?.toLowerCase() ?? "none";

/**
 * Gmail's own address for composing a `mailto:` link, under Gmail's home,
 * which redirects to its full-page compose with To, Cc, Subject and body
 * filled.
 */
export const composeUrl = (gmailHome: string, mailto: string) =>
  `${gmailHome.replace(/\/$/u, "")}/?extsrc=mailto&url=${encodeURIComponent(mailto)}`;

/**
 * The URLs a launch's or a second launch's arguments carry, in order: each
 * argument that is not a switch and starts with a scheme.
 */
export const incomingUrlsOf = (argv: readonly string[]) =>
  argv.filter((argument) => !argument.startsWith("-") && SCHEME.test(argument));
