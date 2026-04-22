import { Toaster } from "@meru/ui/components/sonner";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { AppSidebar } from "./components/app-sidebar";
import { useMouseAccountSwitching } from "./lib/hooks";
import { useThemeStore } from "@meru/renderer-lib/theme";

export function App() {
  const theme = useThemeStore((state) => state.theme);

  useMouseAccountSwitching();

  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/unified-inbox">
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
  );
}
