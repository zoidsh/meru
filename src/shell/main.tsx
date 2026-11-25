import "#ui/styles.css";
import { I18nProvider } from "@lingui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  activateLanguage,
  AVAILABLE_LANGUAGES,
  i18n,
  resolveLanguage,
} from "#i18n/index.ts";

import { App } from "./app.tsx";
import { playSounds } from "./sound.ts";
import { followLanguage } from "./sync.ts";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("The shell page has no #root element");
}

const showLanguage = (language: string) => {
  if (i18n.locale === language && document.documentElement.lang === language) {
    return;
  }

  activateLanguage(language);
  document.documentElement.lang = language;
};

// Main names the language in the URL, so the first paint is already in it.
const named = new URLSearchParams(location.search).get("lang") ?? "";

showLanguage(
  AVAILABLE_LANGUAGES.includes(named) ? named : resolveLanguage([named])
);
followLanguage(showLanguage);
playSounds(window.meru);

createRoot(root).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </StrictMode>
);
