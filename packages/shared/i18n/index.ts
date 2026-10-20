import { i18n, type Messages } from "@lingui/core";
import { messages as en } from "./locales/en";
import { CATALOG_TAGS, type CatalogTag } from "./tags";

export { CATALOG_TAGS, type CatalogTag, SHIPPED_CATALOG_TAGS } from "./tags";

/**
 * Each language named in itself, because `Intl.DisplayNames` gives lowercase
 * forms such as *français* and disagrees with Apple on the Spanish regions.
 * They are the same in every language, so they are never translated.
 */
export const CATALOG_NAMES: Record<CatalogTag, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  es: "Español (España)",
  "es-419": "Español (Latinoamérica)",
  "pt-BR": "Português (Brasil)",
  nl: "Nederlands",
  pl: "Polski",
  sv: "Svenska",
  ja: "日本語",
};

/*
 * Only a shipped catalog is compiled, so the rest are absent from the bundle
 * until they ship. English is always there, which is what makes it the floor
 * every other lookup falls to.
 */
const catalogs: { en: Messages } & Partial<Record<CatalogTag, Messages>> = { en };

export function isCatalogTag(value: string): value is CatalogTag {
  return (CATALOG_TAGS as readonly string[]).includes(value);
}

/**
 * The catalogs a BCP 47 tag prefers beyond an exact match, before its language
 * subtag is tried: Apple's two Spanish regions, and Portuguese, which is
 * Brazilian only and which Portuguese readers take over English.
 */
function getAliases(language: string): CatalogTag[] {
  if (language === "es" || language === "es-es") {
    return ["es"];
  }

  if (language.startsWith("es-")) {
    return ["es-419"];
  }

  if (language === "pt" || language.startsWith("pt-")) {
    return ["pt-BR"];
  }

  return [];
}

/**
 * The catalog for the first of the preferred languages that matches one,
 * matching each in turn by exact tag, then by alias, then by language subtag.
 *
 * Resolved one preferred language at a time rather than in passes over all of
 * them, so a closer match further down the list never beats the user's first
 * choice.
 */
export function resolveLocale(
  preferredLanguages: readonly string[],
  shippedTags: readonly CatalogTag[],
): CatalogTag {
  for (const preferredLanguage of preferredLanguages) {
    // Linux hands over glibc modifiers such as `@euro` and `@latin`.
    const language = preferredLanguage.toLowerCase().replace(/@.*/, "");

    const exactTag = shippedTags.find((tag) => tag.toLowerCase() === language);

    if (exactTag) {
      return exactTag;
    }

    for (const alias of getAliases(language)) {
      if (shippedTags.includes(alias)) {
        return alias;
      }
    }

    const [subtag] = language.split("-");

    const tagByLanguage = shippedTags.find((tag) => tag.toLowerCase().split("-")[0] === subtag);

    if (tagByLanguage) {
      return tagByLanguage;
    }
  }

  return "en";
}

/** dayjs names its locales its own way, and lowercases every region. */
export function getDayjsLocale(tag: CatalogTag) {
  if (tag === "es-419") {
    return "es-mx";
  }

  return tag.toLowerCase();
}

/**
 * A tag without a catalog activates English whole, since another locale's
 * plural rules over English messages would pick the wrong forms. Returns the
 * tag it activated.
 */
export function activateLocale(tag: CatalogTag): CatalogTag {
  const messages = catalogs[tag];

  if (messages) {
    i18n.loadAndActivate({ locale: tag, messages });

    return tag;
  }

  i18n.loadAndActivate({ locale: "en", messages: catalogs.en });

  return "en";
}

/*
 * A macro call throws while no locale is active, and main runs some code before
 * it resolves the user's language, so English is active from the start.
 */
activateLocale("en");

export { i18n };
