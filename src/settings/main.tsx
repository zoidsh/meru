import "#ui/styles.css";
import { I18nProvider } from "@lingui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { activateLanguage, i18n, resolveLanguage } from "#i18n/index.ts";

import { App } from "./app.tsx";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("The Settings page has no #root element");
}

// Main resolves the language once and names it in the URL, so the first paint
// is already in it.
const language = resolveLanguage([
  new URLSearchParams(location.search).get("lang") ?? "",
]);

activateLanguage(language);
document.documentElement.lang = language;

createRoot(root).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </StrictMode>
);
