export type CuratedExtension = {
  /** The Chrome Web Store id, which every package has to be signed for. */
  id: string;
  name: string;
  description: string;
  /**
   * Match patterns the derive writes over every `content_scripts[].matches` of
   * the extension, so its content scripts only reach the sites it is offered
   * for. Absent leaves the manifest's own patterns in place.
   */
  contentScriptMatches?: string[];
};

/**
 * The extensions Meru offers, the only ones it installs. An id outside this
 * list is refused before anything is downloaded, and the settings page is a
 * view of it.
 */
export const curatedExtensions: CuratedExtension[] = [
  {
    id: "aeblfdkhhhdcdjpifhhbdiojplfjncoa",
    name: "1Password",
    description:
      "Password manager that fills logins and signs you in with passkeys stored in your vault.",
    contentScriptMatches: ["https://accounts.google.com/*"],
  },
];

export function isCuratedExtensionId(extensionId: string) {
  return curatedExtensions.some((curatedExtension) => curatedExtension.id === extensionId);
}
