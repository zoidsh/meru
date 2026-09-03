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
  },
];

export function isCuratedExtensionId(extensionId: string) {
  return curatedExtensions.some((curatedExtension) => curatedExtension.id === extensionId);
}
