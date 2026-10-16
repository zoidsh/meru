import { i18n, type Messages } from "@lingui/core";
import { messages as de } from "./locales/de";
import { messages as en } from "./locales/en";
import { messages as pl } from "./locales/pl";

export const LOCALES = ["en", "de", "pl"] as const;

export type Locale = (typeof LOCALES)[number];

const catalogs: Record<Locale, Messages> = { en, de, pl };

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

export function activateLocale(locale: Locale) {
  i18n.loadAndActivate({ locale, messages: catalogs[locale] });
}

export { i18n };
