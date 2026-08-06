import { renderApp } from "@meru/shared/renderer/react";
import { useThemeStore } from "@meru/shared/renderer/theme";
import { Toaster } from "@meru/ui/components/sonner";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTitlebar } from "@/components/app-titlebar";
import { VerticalTabs } from "@/components/vertical-tabs";
import { useMouseAccountSwitching } from "@/lib/hooks";
import "@/lib/ipc";

function Main() {
  const theme = useThemeStore((state) => state.theme);

  useMouseAccountSwitching();

  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/main/unified-inbox">
          <div className="flex h-screen flex-col">
            <AppTitlebar />
            <div className="flex flex-1 overflow-hidden">
              <AppMain />
            </div>
          </div>
        </Route>
        <Route path="/main/*?">
          <div className="flex h-screen flex-col">
            <AppTitlebar />
            <div className="flex flex-1 overflow-hidden">
              <VerticalTabs />
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

renderApp(Main);
