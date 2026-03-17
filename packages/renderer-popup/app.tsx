import { TooltipProvider } from "@meru/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "@meru/renderer-lib/react-query";
import { Route } from "wouter";
import { DesktopSources } from "./routes/desktop-sources";
import { RecentDownloadHistory } from "./routes/recent-download-history";
import { useHotkeys } from "react-hotkeys-hook";
import { Toaster } from "@meru/ui/components/sonner";
import { useThemeStore } from "@meru/renderer-lib/stores";

export function App() {
  const theme = useThemeStore((state) => state.theme);

  useHotkeys("esc", () => window.close());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router hook={useHashLocation}>
          <Route path="/desktop-sources" component={DesktopSources} />
          <Route path="/recent-download-history" component={RecentDownloadHistory} />
        </Router>
        <Toaster theme={theme} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
