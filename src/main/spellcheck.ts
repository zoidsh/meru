import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { SpellChecker } from "#platform/spellcheck.ts";

import type { SettingsStore } from "./settings.ts";

export interface SpellcheckDeps {
  checker: SpellChecker;
  settings: Pick<SettingsStore, "get" | "onChange">;
  log: Log;
}

/**
 * The languages every profile's session checks on Windows and Linux: the
 * system's, or with no dictionary for it those Chromium chose, then those
 * chosen in Settings. A profile's session is given them as it is first
 * used, and again on every change.
 */
export const createSpellcheck = ({
  checker,
  settings,
  log,
}: SpellcheckDeps) => {
  const prepared = new Set<string>();

  // Chromium throws on a language missing from its list, such as the locale
  // `ja`, and then sets none of the others, so only listed ones are given.
  const always = () => {
    const system = checker.systemLanguage();

    return checker.available().includes(system) ? [system] : checker.defaults();
  };

  const apply = (partition: string) => {
    const available = checker.available();
    const chosen = settings.get("spellcheckLanguages").filter((language) => {
      if (available.includes(language)) {
        return true;
      }

      log("spellchecker-language-dropped", { language: scrub.token(language) });

      return false;
    });

    checker.set(partition, [...new Set([...always(), ...chosen])]);
  };

  settings.onChange("spellcheckLanguages", () => {
    for (const partition of prepared) {
      apply(partition);
    }
  });

  return {
    /** Gives the partition's session its languages, once; later calls change nothing. */
    prepare: (partition: string) => {
      if (prepared.has(partition)) {
        return;
      }

      prepared.add(partition);
      apply(partition);
    },
    /**
     * What the Spelling row offers: the languages every session checks
     * whatever is chosen, whether they are the system's, and every other
     * one Chromium has.
     */
    read: () => {
      const base = always();

      return {
        always: base,
        system: base.includes(checker.systemLanguage()),
        available: checker
          .available()
          .filter((language) => !base.includes(language)),
      };
    },
  };
};

export type Spellcheck = ReturnType<typeof createSpellcheck>;
