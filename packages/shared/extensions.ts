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
    description:
      "Password manager that fills logins and signs you in with passkeys stored in your vault.",
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
