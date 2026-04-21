import type * as React from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE, i18next, initI18n, type LocaleCode } from "./index";

let reactInitialized = false;

function ensureReactI18n(lng: LocaleCode) {
  if (reactInitialized) {
    return;
  }

  i18next.use(initReactI18next);

  initI18n({ lng });

  reactInitialized = true;
}

export function I18nProvider({
  children,
  lng = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  lng?: LocaleCode;
}) {
  ensureReactI18n(lng);

  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
}

export { useTranslation } from "react-i18next";
