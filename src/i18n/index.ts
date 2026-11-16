import { i18n } from "@lingui/core";
import type { Messages } from "@lingui/core";

import type { Language } from "./languages.ts";
import { messages as en } from "./locales/en.po";

export { type Language, LANGUAGES, resolveLanguage } from "./languages.ts";

const CATALOGS: Record<Language, Messages> = { en };

export const activateLanguage = (language: Language) => {
  i18n.loadAndActivate({ locale: language, messages: CATALOGS[language] });
};

// A macro throws while no language is active, and main can fail before it has
// resolved one.
activateLanguage("en");

export { i18n };
