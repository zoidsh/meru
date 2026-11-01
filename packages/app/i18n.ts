import { GMAIL_PRELOAD_LOCALE_ARGUMENT } from "@meru/shared/gmail";
import {
  activateLocale,
  type CatalogLoaders,
  type LocaleTag,
  PSEUDO_LOCALE,
  resolveLocale,
  SHIPPED_CATALOG_TAGS,
} from "@meru/shared/i18n";
import { app } from "electron";
import { config } from "@/config";
import { log } from "@/lib/log";

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

/*
 * The Gmail preload's own catalogs, which main loads on its behalf: a
 * sandboxed preload is a single file with no chunk to load one from.
 */
export const gmailCatalogLoaders: CatalogLoaders = {
  de: () => import("@meru/preload-gmail/locales/de"),
  fr: () => import("@meru/preload-gmail/locales/fr"),
  it: () => import("@meru/preload-gmail/locales/it"),
  es: () => import("@meru/preload-gmail/locales/es"),
  "es-419": () => import("@meru/preload-gmail/locales/es-419"),
  "pt-BR": () => import("@meru/preload-gmail/locales/pt-BR"),
  ja: () => import("@meru/preload-gmail/locales/ja"),
  ...(process.env.MERU_PSEUDO_LOCALE_CATALOG
    ? { [PSEUDO_LOCALE]: () => import("@meru/preload-gmail/locales/en-XA") }
    : {}),
};

class AppI18n {
  private activeLocale: LocaleTag = "en";

  private gmailArguments: string[] = [];

  /**
   * The catalog the interface is drawn from, as activated at startup, so a
   * view made after a change in Settings still matches the rest of the app.
   */
  get locale(): LocaleTag {
    return this.activeLocale;
  }

  /**
   * What a Gmail view's preload reads its catalog from, none for English, which
   * the preload carries itself.
   */
  get gmailPreloadArguments(): string[] {
    return this.gmailArguments;
  }

  /**
   * Awaited before the menu, the tray and the first renderer load, each of
   * which reads the active catalog as it is built. A language picked later
   * takes effect at the next start.
   */
  async init() {
    this.activeLocale = await activateLocale(resolveAppLocale());

    // Without its catalog a Gmail view shows English, which beats a start that
    // never gets as far as a window.
    const gmailCatalog = await gmailCatalogLoaders[this.activeLocale]?.().catch(
      (error: unknown) => {
        log.error(
          `Failed to load the Gmail ${this.activeLocale} catalog; Gmail views fall back to English`,
          error,
        );
      },
    );

    this.gmailArguments = gmailCatalog
      ? [
          `${GMAIL_PRELOAD_LOCALE_ARGUMENT}=${encodeURIComponent(
            JSON.stringify({ locale: this.activeLocale, messages: gmailCatalog.messages }),
          )}`,
        ]
      : [];
  }
}

export const appI18n = new AppI18n();
