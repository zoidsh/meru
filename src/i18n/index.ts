import { i18n } from "@lingui/core";
import type { Messages } from "@lingui/core";

import { LANGUAGE_NAMES, LANGUAGES } from "./languages.ts";
import { messages as en } from "./locales/en.po";
import {
  PSEUDO_LANGUAGE,
  PSEUDO_LANGUAGE_NAME,
  pseudoMessages,
} from "./pseudo.ts";

export { type Language, LANGUAGES, resolveLanguage } from "./languages.ts";

const CATALOGS: Record<string, Messages> = {
  en,
  ...(MERU_E2E_BUILD && { [PSEUDO_LANGUAGE]: pseudoMessages(en) }),
};

/** Every language this build can show, English first. */
export const AVAILABLE_LANGUAGES: readonly [string, ...string[]] =
  MERU_E2E_BUILD ? [...LANGUAGES, PSEUDO_LANGUAGE] : LANGUAGES;

/** Each language of `AVAILABLE_LANGUAGES` named in itself, never translated. */
export const languageName = (language: string) =>
  MERU_E2E_BUILD && language === PSEUDO_LANGUAGE
    ? PSEUDO_LANGUAGE_NAME
    : ((LANGUAGE_NAMES as Record<string, string>)[language] ?? language);

/** Shows every string in `language`, a tag of `AVAILABLE_LANGUAGES`. */
export const activateLanguage = (language: string) => {
  const messages = CATALOGS[language];

  if (!messages) {
    throw new Error(`Meru has no catalog for ${language}`);
  }

  i18n.loadAndActivate({ locale: language, messages });
};

// A macro throws while no language is active, and main can fail before it has
// resolved one.
activateLanguage("en");

export { i18n };
