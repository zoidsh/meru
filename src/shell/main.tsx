import "#ui/styles.css";
import { I18nProvider } from "@lingui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { TOOLTIP_FRAME_NAME } from "#core/overlay.ts";
import { activateLanguage, i18n, resolveLanguage } from "#i18n/index.ts";

import { App } from "./app.tsx";
import { openShellDocument } from "./shell-document.ts";
import { playSounds } from "./sound.ts";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("The shell page has no #root element");
}

// Main resolves the language once and names it in the URL, so the first paint
// is already in it.
const language = resolveLanguage([
  new URLSearchParams(location.search).get("lang") ?? "",
]);

activateLanguage(language);
document.documentElement.lang = language;
playSounds(window.meru);
// Opened now rather than at the first tooltip: opening a window while the
// pointer is pressed loses the click.
openShellDocument(TOOLTIP_FRAME_NAME);

createRoot(root).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </StrictMode>
);
