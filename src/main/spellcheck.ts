import type { SpellChecker } from "#platform/spellcheck.ts";

import type { SettingsStore } from "./settings.ts";

export interface SpellcheckDeps {
  checker: SpellChecker;
  settings: Pick<SettingsStore, "get" | "onChange">;
  log: (message: string) => void;
}

/**
 * The languages every profile's session checks on Windows and Linux: the
 * system's, then those chosen in Settings, never none where Chromium has a
 * dictionary for any. A profile's session is given them as it is first
 * used, and again on every change.
 */
export const createSpellcheck = ({
  checker,
  settings,
  log,
}: SpellcheckDeps) => {
  const prepared = new Set<string>();

  const supported = (partition: string) => (language: string) => {
    try {
      checker.set(partition, [language]);

      return true;
    } catch (error) {
      log(
        `Dropped the spellchecker language ${language}: ${error instanceof Error ? error.message : String(error)}`
      );

      return false;
    }
  };

  const apply = (partition: string) => {
    const system = checker.systemLanguage();
    const chosen = settings.get("spellcheckLanguages");

    try {
      checker.set(partition, [...new Set([system, ...chosen])]);

      return;
    } catch {
      // Chromium throws on a language it has no dictionary for, such as the
      // locale `ja`, and then sets none of them, so each is tried alone.
    }

    const isSupported = supported(partition);
    const base = isSupported(system) ? [system] : checker.defaults();

    checker.set(partition, [
      ...new Set([...base, ...chosen.filter(isSupported)]),
    ]);
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
    /** What the Spelling row offers: the system's language and every other one Chromium has. */
    read: () => {
      const system = checker.systemLanguage();

      return {
        system,
        available: checker
          .available()
          .filter((language) => language !== system),
      };
    },
  };
};

export type Spellcheck = ReturnType<typeof createSpellcheck>;
