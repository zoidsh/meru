import "#ui/styles.css";
import { I18nProvider } from "@lingui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { firstLanguage, showLanguage } from "#i18n/document.ts";
import { i18n } from "#i18n/index.ts";

import { App } from "./app.tsx";
import { playSounds } from "./sound.ts";
import { followLanguage } from "./sync.ts";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("The shell page has no #root element");
}

const show = (language: string) => {
  showLanguage(document.documentElement, language);
};

show(firstLanguage(location.search));
followLanguage(show);
playSounds(window.meru);

createRoot(root).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </StrictMode>
);
