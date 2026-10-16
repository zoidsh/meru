import { activateLocale, i18n, isLocale } from "@meru/shared/i18n";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { queryClient } from "./react-query";
import { initTheme } from "./theme";

/*
 * Spike: main hands the locale over in the page's search parameters, the way
 * the theme and the other first-paint values already travel, so the first
 * render is translated without an IPC round trip.
 */
function initLocale() {
  const locale = new URLSearchParams(window.location.search).get("locale");

  activateLocale(locale && isLocale(locale) ? locale : "en");

  document.documentElement.lang = i18n.language;
}

export function renderApp(App: React.ComponentType) {
  initTheme();

  initLocale();

  const rootElement = document.getElementById("root");

  if (rootElement) {
    const root = createRoot(rootElement);

    root.render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nextProvider>,
    );
  }
}
