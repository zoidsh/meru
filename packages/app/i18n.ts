import {
  activateLocale,
  type CatalogTag,
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
 */
function resolveAppLocale(): CatalogTag {
  const language = config.get("app.language");

  if (language !== "system" && SHIPPED_CATALOG_TAGS.includes(language)) {
    return language;
  }

  return resolveLocale(app.getPreferredSystemLanguages(), SHIPPED_CATALOG_TAGS);
}

class AppI18n {
  private activeLocale: CatalogTag = "en";

  /**
   * The catalog the interface is drawn from, as activated at startup, so a
   * view made after a change in Settings still matches the rest of the app.
   */
  get locale(): CatalogTag {
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
