/** The class an extension belongs to, which is what the page can speak about. */
export type CuratedExtensionCategory = "passwordManager";

export type CuratedExtension = {
  /** The Chrome Web Store id, which every package has to be signed for. */
  id: string;
  name: string;
  description: string;
  category: CuratedExtensionCategory;
  /**
   * Match patterns the derive writes over every `content_scripts[].matches` of
   * the extension, so its content scripts only reach the sites it is offered
   * for. Absent leaves the manifest's own patterns in place.
   */
  contentScriptMatches?: string[];
  /**
   * The extension's telemetry, crash-reporting and log-collection endpoints, as
   * match patterns. Requests to them are canceled in the session the
   * extension's service worker runs in, which is where an extension of this
   * size does its reporting from.
   *
   * Only what the product does not need: an endpoint the extension depends on
   * belongs nowhere near this list, since a cancel here is indistinguishable
   * from the network being down.
   *
   * Host-exact, never a wildcard over a domain. 1Password serves certificate
   * revocation from `crl.1passwordservices.com`, the same second-level domain
   * as two of the hosts below, so a pattern that widened to the domain would
   * take a working password manager with it.
   */
  telemetryUrls?: string[];
};

/** The 1Password Chrome Web Store id, which app and settings both single out. */
export const ONEPASSWORD_EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

/**
 * The extensions Meru offers, the only ones it installs. An id outside this
 * list is refused before anything is downloaded, and the settings page is a
 * view of it.
 */
export const curatedExtensions: CuratedExtension[] = [
  {
    id: ONEPASSWORD_EXTENSION_ID,
    name: "1Password",
    // Meru builds for the Google sign-in flows and nothing else, so the copy
    // names them and then says what the user won't find, rather than leaving
    // the absences to be discovered: content scripts stop at the two hosts
    // below, `commands`, `contextMenus` and `notifications` are facade noops,
    // and `tabs.create` is unimplemented, so a popup entry that opens one of
    // the extension's own pages — its settings, its full item view — does
    // nothing at all.
    description:
      "Signs you in to your Google Account with a saved password or passkey, and generates new ones when you change your password or add a passkey. Nothing else is supported: no in-page filling outside those pages, no card or address autofill, no keyboard shortcuts, right-click fill or notifications, and no way to reach 1Password's own pages, such as its settings.",
    category: "passwordManager",
    // Sign-in runs on accounts.google.com, and account settings — creating a
    // passkey, changing a password — on myaccount.google.com. Both hosts, not
    // the settings paths alone: Google reshuffles those and redirects between
    // them, and a path that falls outside the clamp offers nothing, silently
    contentScriptMatches: ["https://accounts.google.com/*", "https://myaccount.google.com/*"],
    telemetryUrls: [
      // Observability: every console line the worker writes, forwarded as a
      // metric over Connect, and log entries carrying account uuids beside them
      "https://client-log-forwarder.1password.com/*",
      "https://client-log-forwarder.1password.ca/*",
      "https://client-log-forwarder.1password.eu/*",
      // Snowplow product telemetry, and the Snowplow Mini collector the
      // extension's own policy also allows it to reach
      "https://telemetry.1passwordservices.com/*",
      "https://com-1password-prod1.mini.snplow.net/*",
      // Sentry error reporting, initialized as the worker starts
      "https://b5x-sentry.1passwordservices.com/*",
    ],
  },
];

export function isCuratedExtensionId(extensionId: string) {
  return curatedExtensions.some((curatedExtension) => curatedExtension.id === extensionId);
}
