import { Toaster } from "@meru/ui/components/sonner";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTitlebar } from "@/components/app-titlebar";
import { VerticalTabs } from "@/components/vertical-tabs";
import { useMouseAccountSwitching } from "@/lib/hooks";
import { renderApp } from "@/lib/react";
import { prefetchConfig } from "@/lib/react-query";
import { seedMainWindowStores, useAccountsStore } from "@/lib/stores";
import { useThemeStore } from "@/lib/theme";
import "@/lib/ipc";

function Main() {
  const theme = useThemeStore((state) => state.theme);

  const areAccountsLoaded = useAccountsStore((state) => state.isLoaded);

  useMouseAccountSwitching();

  // Drawing the titlebar before the accounts are in would flash an empty
  // account switcher.
  if (!areAccountsLoaded) {
    return;
  }

  return (
    <Router hook={useHashLocation}>
      <div className="flex h-screen flex-col overflow-hidden">
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

prefetchConfig();

seedMainWindowStores();

renderApp(Main);
