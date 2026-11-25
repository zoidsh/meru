import { app, session } from "electron";

/**
 * The spell checker of a profile's session on Windows and Linux, where
 * Chromium checks with Hunspell dictionaries, each downloaded from Google's
 * servers the first time its language is checked. macOS checks with its own
 * and Electron ignores a list there.
 */
export interface SpellChecker {
  /** The language the system runs in, as Chromium names it (`en-US`). */
  systemLanguage: () => string;
  /** Every language Chromium has a dictionary for. */
  available: () => string[];
  /**
   * What Chromium checks in a session that was never given a list, which it
   * chose from the system.
   */
  defaults: () => string[];
  /**
   * Checks the partition's session in these languages. Throws on a language
   * Chromium has no dictionary for, and then sets none of them.
   */
  set: (partition: string, languages: readonly string[]) => void;
}

export const createSpellChecker = (): SpellChecker => ({
  systemLanguage: () => app.getLocale(),
  available: () => session.defaultSession.availableSpellCheckerLanguages,
  // Meru never sets the default session's languages, so it holds Chromium's.
  defaults: () => session.defaultSession.getSpellCheckerLanguages(),
  set: (partition, languages) => {
    session.fromPartition(partition).setSpellCheckerLanguages([...languages]);
  },
});
