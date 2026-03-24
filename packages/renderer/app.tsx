import { Toaster } from "@meru/ui/components/sonner";
import { TooltipProvider } from "@meru/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { AppSidebar } from "./components/app-sidebar";
import { useMouseAccountSwitching } from "./lib/hooks";
import { queryClient } from "@meru/renderer-lib/react-query";
import { useThemeStore } from "@meru/renderer-lib/stores";

export function App() {
  const theme = useThemeStore((state) => state.theme);

  useMouseAccountSwitching();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/all-inboxes">
              <div className="h-screen flex flex-col">
                <AppTitlebar />
                <div className="flex-1 flex overflow-hidden">
                  <AppMain />
                </div>
              </div>
            </Route>
            <Route>
              <div className="h-screen flex flex-col">
                <AppTitlebar />
                <div className="flex-1 flex overflow-hidden">
                  <AppSidebar />
                  <AppMain />
                </div>
              </div>
              <Toaster theme={theme} />
            </Route>
          </Switch>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
