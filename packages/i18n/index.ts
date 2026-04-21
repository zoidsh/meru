import i18next, { type i18n } from "i18next";
import en from "./locales/en.json";

export type LocaleCode = "en";

export type LocaleMeta = {
  code: LocaleCode;
  name: string;
  nativeName: string;
};

export const SUPPORTED_LOCALES: readonly LocaleMeta[] = [
  { code: "en", name: "English", nativeName: "English" },
];

export const DEFAULT_LOCALE: LocaleCode = "en";

export const resources = {
  en: { translation: en },
} as const;

export function resolveLocale(requested: string | undefined | null): LocaleCode {
  if (!requested) {
    return DEFAULT_LOCALE;
  }

  const normalized = requested.toLowerCase().split(/[-_]/)[0];

  for (const locale of SUPPORTED_LOCALES) {
    if (locale.code === normalized) {
      return locale.code;
    }
  }

  return DEFAULT_LOCALE;
}

export type InitI18nOptions = {
  lng?: LocaleCode;
};

let initialized = false;

export function initI18n({ lng = DEFAULT_LOCALE }: InitI18nOptions = {}): i18n {
  if (initialized) {
    return i18next;
  }

  i18next.init({
    lng,
    fallbackLng: DEFAULT_LOCALE,
    resources,
    returnEmptyString: false,
    interpolation: {
      escapeValue: false,
    },
  });

  initialized = true;

  return i18next;
}

export function t(...args: Parameters<typeof i18next.t>) {
  if (!initialized) {
    initI18n();
  }

  return i18next.t(...args);
}

export { i18next };
