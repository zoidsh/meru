import { TooltipProvider } from "@meru/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "@meru/renderer-lib/react-query";
import { Route } from "wouter";
import { DesktopSources } from "./routes/desktop-sources";
import { DownloadHistory } from "./routes/download-history";
import { useHotkeys } from "react-hotkeys-hook";

export function App() {
  useHotkeys("esc", () => window.close());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router hook={useHashLocation}>
          <Route path="/desktop-sources" component={DesktopSources} />
          <div className="p-4">
            <Route path="/download-history" component={DownloadHistory} />
          </div>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
