import { i18n, type Messages } from "@lingui/core";
import { messages as en } from "./locales/en";
import { CATALOG_TAGS, type CatalogTag, type LocaleTag, PSEUDO_LOCALE } from "./tags";

export {
  CATALOG_TAGS,
  type CatalogTag,
  type LocaleTag,
  PSEUDO_LOCALE,
  SHIPPED_CATALOG_TAGS,
} from "./tags";

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
 * until they ship. Each one is a chunk of its own, so a process parses only the
 * language it shows. English is in the bundle itself, which is what makes it
 * the floor every other lookup falls to.
 */
/** Each catalog a build carries beyond English, loaded when it is activated. */
export type CatalogLoaders = Partial<Record<LocaleTag, () => Promise<{ messages: Messages }>>>;

const catalogLoaders: CatalogLoaders = {
  de: () => import("./locales/de"),
  fr: () => import("./locales/fr"),
  it: () => import("./locales/it"),
  es: () => import("./locales/es"),
  "es-419": () => import("./locales/es-419"),
  "pt-BR": () => import("./locales/pt-BR"),
  ja: () => import("./locales/ja"),
  // The build inlines the variable, so a shipped bundle drops the pseudo-locale
  // with this branch.
  ...(process.env.MERU_PSEUDO_LOCALE_CATALOG
    ? { [PSEUDO_LOCALE]: () => import("./locales/en-XA") }
    : {}),
};

export function isCatalogTag(value: string): value is CatalogTag {
  return (CATALOG_TAGS as readonly string[]).includes(value);
}

export function isLocaleTag(value: string): value is LocaleTag {
  return value === PSEUDO_LOCALE || isCatalogTag(value);
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
export function getDayjsLocale(tag: LocaleTag) {
  if (tag === "es-419") {
    return "es-mx";
  }

  if (tag === PSEUDO_LOCALE) {
    return "en";
  }

  return tag.toLowerCase();
}

/**
 * A tag without a catalog, or whose catalog fails to load, activates English
 * whole, since another locale's plural rules over English messages would pick
 * the wrong forms. Resolves with the tag it activated.
 *
 * A failed load never rejects: main awaits this before it opens its window and
 * the renderer before its first render, so a rejection would leave no window or
 * a blank one rather than an English one.
 */
export async function activateLocale(tag: LocaleTag): Promise<LocaleTag> {
  const loadCatalog = catalogLoaders[tag];

  if (loadCatalog) {
    try {
      const { messages } = await loadCatalog();

      i18n.loadAndActivate({ locale: tag, messages });

      return tag;
    } catch (error) {
      console.error(`Failed to load the ${tag} catalog; falling back to English`, error);
    }
  }

  i18n.loadAndActivate({ locale: "en", messages: en });

  return "en";
}

/*
 * A macro call throws while no locale is active, and main runs some code before
 * it resolves the user's language, so English is active from the start.
 */
i18n.loadAndActivate({ locale: "en", messages: en });

export { i18n };
