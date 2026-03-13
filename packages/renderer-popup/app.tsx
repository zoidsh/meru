import { TooltipProvider } from "@meru/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "@meru/renderer-lib/react-query";
import { Route } from "wouter";
import { DesktopSources } from "./routes/desktop-sources";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router hook={useHashLocation}>
          <Route path="/desktop-sources" component={DesktopSources} />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
