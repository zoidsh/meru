import { appLanguage } from "#i18n/languages.ts";

import type { SettingsStore } from "./settings.ts";

export interface LanguageDeps {
  settings: Pick<SettingsStore, "get" | "onChange">;
  /** Every language this build can show, English first. */
  available: readonly [string, ...string[]];
  /** The system's languages, most preferred first, read as each change is. */
  preferredLanguages: () => readonly string[];
  /** Shows every string of main in the language from now on. */
  activate: (language: string) => void;
}

/**
 * The language Meru shows, `language` as stored where this build has it,
 * else the system's, applied at once to whatever listens: the menus, the
 * tray and the renderers.
 */
export const createLanguage = ({
  settings,
  available,
  preferredLanguages,
  activate,
}: LanguageDeps) => {
  const listeners = new Set<() => void>();
  const resolve = () =>
    appLanguage(settings.get("language"), preferredLanguages(), available);

  let current = resolve();

  activate(current);

  settings.onChange("language", () => {
    const next = resolve();

    if (next === current) {
      return;
    }

    current = next;
    activate(next);

    for (const listener of listeners) {
      listener();
    }
  });

  return {
    current: () => current,
    /** What System shows Meru in. */
    system: () => appLanguage("system", preferredLanguages(), available),
    available,
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type Language = ReturnType<typeof createLanguage>;
