/**
 * The site a link belongs to, as trusted sites are kept: its origin, such as
 * `https://example.com`, which is what v3 stores, so its list carries over
 * as it is. `undefined` for anything but an `http` or `https` URL.
 */
export const siteOf = (url: string) => {
  const parsed = URL.parse(url);

  return parsed?.protocol === "http:" || parsed?.protocol === "https:"
    ? parsed.origin
    : undefined;
};

/** How a site is named to a person: its host, `example.com`. */
export const siteName = (site: string) => URL.parse(site)?.host ?? site;

/** Whether Meru asks before the link opens in the default browser. */
export const asksBeforeOpening = (
  url: string,
  { confirm, trusted }: { confirm: boolean; trusted: readonly string[] }
) => {
  const site = siteOf(url);

  return confirm && (site === undefined || !trusted.includes(site));
};

/** The list with `site` at its end, once. */
export const withSite = (trusted: readonly string[], site: string) =>
  trusted.includes(site) ? [...trusted] : [...trusted, site];

/** The list without `site`. */
export const withoutSite = (trusted: readonly string[], site: string) =>
  trusted.filter((entry) => entry !== site);

/** What v3 shows of a long link in its prompt, and no more. */
const MAX_SHOWN_URL_LENGTH = 256;

/** The link as the prompt shows it, cut with an ellipsis past its limit. */
export const shownUrl = (url: string) =>
  url.length > MAX_SHOWN_URL_LENGTH
    ? `${url.slice(0, MAX_SHOWN_URL_LENGTH - 1)}…`
    : url;
