import i18next from "i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";
import pl from "./locales/pl.json";

export const LOCALES = ["en", "de", "pl"] as const;

export type Locale = (typeof LOCALES)[number];

export const NAMESPACE = "translation";

const catalogs: Record<Locale, typeof en> = { en, de, pl };

i18next.init({
  lng: "en",
  fallbackLng: "en",
  defaultNS: NAMESPACE,
  resources: Object.fromEntries(
    LOCALES.map((locale) => [locale, { [NAMESPACE]: catalogs[locale] }]),
  ),
  // Every consumer renders into a native menu, a dialog or React, none of which
  // take an HTML string, so i18next's HTML escaping would only mangle
  // apostrophes and quotes.
  interpolation: { escapeValue: false },
});

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Matches a BCP 47 tag, then its language subtag, against the shipped list. */
export function resolveLocale(preferredLanguages: readonly string[]): Locale {
  for (const language of preferredLanguages) {
    if (isLocale(language)) {
      return language;
    }

    const [subtag] = language.split("-");

    if (subtag && isLocale(subtag)) {
      return subtag;
    }
  }

  return "en";
}

/*
 * `changeLanguage` is declared async for the sake of backends; with every
 * catalog bundled it resolves in the same tick, so a caller that cannot await
 * still sees the new language on the next statement.
 */
export function activateLocale(locale: Locale) {
  return i18next.changeLanguage(locale);
}

export const t = i18next.t;

export { i18next as i18n };
