import { createRoot } from "react-dom/client";
import { queryClient } from "./react-query";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { initTheme } from "./theme";

export function renderApp(App: React.ComponentType) {
  initTheme();

  const rootElement = document.getElementById("root");

  if (rootElement) {
    const root = createRoot(rootElement);

    root.render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </QueryClientProvider>,
    );
  }
}
