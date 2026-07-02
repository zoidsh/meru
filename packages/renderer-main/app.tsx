import { useThemeStore } from "@meru/shared/renderer/theme";
import { Toaster } from "@meru/ui/components/sonner";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { AppSidebar } from "./components/app-sidebar";
import { useMouseAccountSwitching } from "./lib/hooks";

export function App() {
  const theme = useThemeStore((state) => state.theme);

  useMouseAccountSwitching();

  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/unified-inbox">
          <div className="flex h-screen flex-col">
            <AppTitlebar />
            <div className="flex flex-1 overflow-hidden">
              <AppMain />
            </div>
          </div>
        </Route>
        <Route>
          <div className="flex h-screen flex-col">
            <AppTitlebar />
            <div className="flex flex-1 overflow-hidden">
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
