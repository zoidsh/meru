import {
  activateLocale,
  type LocaleTag,
  PSEUDO_LOCALE,
  resolveLocale,
  SHIPPED_CATALOG_TAGS,
} from "@meru/shared/i18n";
import { app } from "electron";
import { config } from "@/config";

/**
 * `"system"` and a tag this build no longer ships both resolve against the
 * preferred system languages, which Electron only answers for once the app is
 * ready.
 *
 * Nothing passes `--lang` or appends a `lang` switch: that would move
 * `navigator.language`, the `Accept-Language` the embedded views send and the
 * spellchecker's defaults along with it, and all three follow the OS.
 *
 * `MERU_PSEUDO_LOCALE` picks the pseudo-locale over everything else, but only
 * in a build that carries its catalog; a shipped build inlines
 * `MERU_PSEUDO_LOCALE_CATALOG` as empty and drops the branch.
 */
function resolveAppLocale(): LocaleTag {
  if (process.env.MERU_PSEUDO_LOCALE_CATALOG && process.env.MERU_PSEUDO_LOCALE) {
    return PSEUDO_LOCALE;
  }

  const language = config.get("app.language");

  if (language !== "system" && SHIPPED_CATALOG_TAGS.includes(language)) {
    return language;
  }

  return resolveLocale(app.getPreferredSystemLanguages(), SHIPPED_CATALOG_TAGS);
}

class AppI18n {
  private activeLocale: LocaleTag = "en";

  /**
   * The catalog the interface is drawn from, as activated at startup, so a
   * view made after a change in Settings still matches the rest of the app.
   */
  get locale(): LocaleTag {
    return this.activeLocale;
  }

  /**
   * Called before the menu, the tray and the first renderer load, each of which
   * reads the active catalog as it is built. A language picked later takes
   * effect at the next start.
   */
  init() {
    this.activeLocale = activateLocale(resolveAppLocale());
  }
}

export const appI18n = new AppI18n();
