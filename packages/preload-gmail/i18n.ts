import { i18n, type Messages } from "@lingui/core";
import { GMAIL_PRELOAD_LOCALE_ARGUMENT } from "@meru/shared/gmail";
import { type CatalogTag, SHIPPED_CATALOG_TAGS } from "@meru/shared/i18n/tags";
import { messages as de } from "./locales/de";
import { messages as en } from "./locales/en";
import { messages as ja } from "./locales/ja";

/*
 * Imports the tags alone, never `@meru/shared/i18n`, whose runtime brings the
 * whole app's catalogs into every Gmail view.
 */
export const catalogs: { en: Messages } & Partial<Record<CatalogTag, Messages>> = {
  en,
  de,
  ja,
};

const LOCALE_ARGUMENT_PREFIX = `${GMAIL_PRELOAD_LOCALE_ARGUMENT}=`;

/** The tag main resolved for the app, or English for one this build doesn't ship. */
export function getPreloadLocale(
  argv: readonly string[],
  shippedTags: readonly CatalogTag[],
): CatalogTag {
  const value = argv
    .find((argument) => argument.startsWith(LOCALE_ARGUMENT_PREFIX))
    ?.slice(LOCALE_ARGUMENT_PREFIX.length);

  return shippedTags.find((tag) => tag === value) ?? "en";
}

/*
 * Main resolves the language once at startup, before the first Gmail view, so
 * activating on load is all a view ever needs.
 */
const locale = getPreloadLocale(process.argv, SHIPPED_CATALOG_TAGS);

const messages = catalogs[locale];

// English whole for a tag without a catalog here, since another locale's
// plural rules over English messages would pick the wrong forms.
i18n.loadAndActivate(messages ? { locale, messages } : { locale: "en", messages: catalogs.en });
