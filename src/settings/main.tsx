import "#ui/styles.css";
import { CSPProvider } from "@base-ui/react/csp-provider";
import { I18nProvider } from "@lingui/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { firstLanguage, showLanguage } from "#i18n/document.ts";
import { i18n } from "#i18n/index.ts";
import { TooltipProvider } from "#ui/tooltip.tsx";

import { App } from "./app.tsx";
import { followLanguage } from "./sync.ts";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("The Settings page has no #root element");
}

const show = (language: string) => {
  showLanguage(document.documentElement, language);
};

show(firstLanguage(location.search));
followLanguage(show);

createRoot(root).render(
  <StrictMode>
    {/* The policy refuses inline styles; styles.css carries the one rule Base UI's would add. */}
    <CSPProvider disableStyleElements>
      <I18nProvider i18n={i18n}>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </I18nProvider>
    </CSPProvider>
  </StrictMode>
);
