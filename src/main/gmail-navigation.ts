export interface GmailNavigationDeps {
  /** Sends the profile's Gmail page to `hash`; false when it has none to. */
  send: (profileId: string, hash: string) => boolean;
  /** Selects the profile's Gmail tab, then the profile, and closes the inbox. */
  jumpTo: (profileId: string) => Promise<unknown>;
  /** Loads `url` in the profile's Gmail tab, selected as `jumpTo` selects it. */
  openMessage: (profileId: string, url: string) => Promise<unknown>;
  /** Gmail's home, or the suite's stand-in's. */
  home: string;
}

/**
 * Takes a profile's Gmail to a place in it: the open page moves there by its
 * hash, so nothing reloads; a tab with no page on Gmail yet, unloaded or on
 * sign-in, loads Gmail's home at that hash.
 */
export const createGmailNavigation =
  ({ send, jumpTo, openMessage, home }: GmailNavigationDeps) =>
  async (profileId: string, hash: string) => {
    await (send(profileId, hash)
      ? jumpTo(profileId)
      : openMessage(profileId, `${home}${hash}`));
  };
