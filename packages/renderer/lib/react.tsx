import { I18nProvider } from "@lingui/react";
import { i18n } from "@meru/shared/i18n";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { initLocale } from "./i18n";
import { queryClient } from "./react-query";
import { initTheme } from "./theme";

export async function renderApp(App: React.ComponentType) {
  initTheme();

  // Awaited before the first render, so that the first paint is already in the
  // page's language rather than English swapped out once its catalog arrives.
  await initLocale();

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
