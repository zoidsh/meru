import { activateLanguage, AVAILABLE_LANGUAGES, i18n } from "./index.ts";
import { resolveLanguage } from "./languages.ts";

/**
 * Shows every string of a renderer in `language` and marks its document so;
 * nothing while both already are.
 */
export const showLanguage = (root: { lang: string }, language: string) => {
  if (i18n.locale === language && root.lang === language) {
    return;
  }

  activateLanguage(language);
  root.lang = language;
};

/**
 * What a renderer first paints in: the language main names in its URL's
 * `lang`, so the first paint is already in it, else the nearest one there is.
 */
export const firstLanguage = (search: string) => {
  const named = new URLSearchParams(search).get("lang") ?? "";

  return AVAILABLE_LANGUAGES.includes(named) ? named : resolveLanguage([named]);
};
