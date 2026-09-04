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
  /**
   * Error lines the extension's service worker writes that say nothing an
   * embedder can act on, as prefixes matched against the start of the message.
   * The worker's console is forwarded to Meru's log, and a line named here
   * goes out at debug instead of error: still there in development, where the
   * worker's console is the only trace of what the extension is doing, and off
   * the disk of every shipped install.
   *
   * A prefix rather than the whole line, because the tail is the extension's
   * own detail — a redacted payload, a request id — and differs line to line.
   *
   * Only lines that carry no diagnostic: this is the last place a worker's
   * failure surfaces, so a prefix wider than the one benign line it was
   * written for takes real errors down to debug with it.
   */
  benignWorkerConsoleErrors?: string[];
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
    //
    // The desktop-app requirement is named before the absences because it is
    // the one that decides whether any of this works: the extension fills
    // nothing until it is connected, and a user who installs without it sees
    // an extension that does nothing rather than one Meru limited. How to
    // connect the two is the setup dialog's job, and the button that opens it
    // sits directly under this text, so the copy states the requirement and
    // stops there.
    description:
      "Signs you in to your Google Account with a saved password or passkey, and generates new ones when you change your password or add a passkey. Needs the 1Password desktop app, connected to Meru. Nothing else is supported: no in-page filling outside those pages, no card or address autofill, no keyboard shortcuts, right-click fill or notifications, and no way to reach 1Password's own pages, such as its settings.",
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
    benignWorkerConsoleErrors: [
      // 1Password re-arms its log-metrics flush every thirty seconds whatever
      // happened to the last one, so the forwarder above being canceled costs
      // two error lines a minute in every shipped log. The line reports Meru's
      // own decision back to it — nothing to act on, and nothing a user could
      // do about it — while a worker error that is not this one still matters
      "[LogManager] Failed to send log metrics",
      // A subframe asking its top frame for configuration, and a subframe
      // telling it to drop an inline button. On the inbox the top frame is
      // outside the content-script clamp so nothing can answer, and on sign-in
      // pages the top frame's handler may not have loaded yet — 1Password's
      // own race, which it catches. Both are deterministic, cost nothing, and
      // name the request they are, so a real relay fault under a different
      // request name — `<autofill-item>`, which once was one — still surfaces
      "[Messaging] Exception while handling request <get-nested-frame-configuration>",
      "[Messaging] Exception while handling request <remove-inline-button>",
    ],
  },
];

export function isCuratedExtensionId(extensionId: string) {
  return curatedExtensions.some((curatedExtension) => curatedExtension.id === extensionId);
}
