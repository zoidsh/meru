/** Where Gmail sends a link in mail through, with the link as `q`. */
const REDIRECT_ORIGIN = "https://www.google.com";

const REDIRECT_PATH = "/url";

/**
 * Google's sign-in and account pages keep their wrapper, so a link in mail
 * never reaches them unwrapped.
 */
const KEPT_WRAPPED_HOSTS: ReadonlySet<string> = new Set([
  "accounts.google.com",
  "myaccount.google.com",
]);

const isWebUrl = (url: URL) =>
  (url.protocol === "https:" || url.protocol === "http:") &&
  !url.username &&
  !url.password;

export const isGoogleRedirect = (url: URL) =>
  url.origin === REDIRECT_ORIGIN && url.pathname === REDIRECT_PATH;

/**
 * The link a Google redirect wraps, when it is a plain web link to open:
 * one `q` naming an `http` or `https` URL with no credentials, not on
 * Google's sign-in or account pages and not another redirect. Anything else
 * is `undefined`, and the redirect is opened as it is.
 */
export const unwrapGoogleRedirect = (url: string): string | undefined => {
  let wrapper: URL;

  try {
    wrapper = new URL(url);
  } catch {
    return;
  }

  if (!isWebUrl(wrapper) || !isGoogleRedirect(wrapper)) {
    return;
  }

  const [query, ...more] = wrapper.searchParams.getAll("q");

  if (query === undefined || more.length > 0) {
    return;
  }

  let target: URL;

  try {
    target = new URL(query);
  } catch {
    return;
  }

  if (
    !isWebUrl(target) ||
    isGoogleRedirect(target) ||
    KEPT_WRAPPED_HOSTS.has(target.hostname)
  ) {
    return;
  }

  return target.href;
};
