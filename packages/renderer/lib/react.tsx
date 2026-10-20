import { I18nProvider } from "@lingui/react";
import { i18n } from "@meru/shared/i18n";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { initLocale } from "./i18n";
import { queryClient } from "./react-query";
import { initTheme } from "./theme";

export function renderApp(App: React.ComponentType) {
  initTheme();

  // Before the provider mounts: it renders nothing until a catalog is active.
  initLocale();

  const rootElement = document.getElementById("root");

  if (rootElement) {
    const root = createRoot(rootElement);

    root.render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>,
    );
  }
}
