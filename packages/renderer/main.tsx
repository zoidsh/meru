import { Toaster } from "@meru/ui/components/sonner";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTitlebar } from "@/components/app-titlebar";
import { VerticalTabs } from "@/components/vertical-tabs";
import { useMouseAccountSwitching } from "@/lib/hooks";
import { renderApp } from "@/lib/react";
import { useThemeStore } from "@/lib/theme";
import "@/lib/ipc";

function Main() {
  const theme = useThemeStore((state) => state.theme);

  useMouseAccountSwitching();

  return (
    <Router hook={useHashLocation}>
      <div className="flex h-screen flex-col">
        <AppTitlebar />
        <div className="flex flex-1 overflow-hidden">
          <Switch>
            <Route path="/">
              <VerticalTabs />
            </Route>
            <Route path="/unified-inbox">
              <AppMain />
            </Route>
            <Route path="/download-history">
              <AppMain />
            </Route>
            <Route>
              <AppSidebar />
              <AppMain />
            </Route>
          </Switch>
        </div>
      </div>
      <Toaster theme={theme} />
    </Router>
  );
}

renderApp(Main);
