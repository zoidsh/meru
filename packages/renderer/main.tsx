import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTitlebar } from "@/components/app-titlebar";
import { AppToaster } from "@/components/app-toaster";
import { VerticalTabs } from "@/components/vertical-tabs";
import { useMouseAccountSwitching } from "@/lib/hooks";
import { renderApp } from "@/lib/react";
import "@/lib/ipc";

function Main() {
  useMouseAccountSwitching();

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
      <AppToaster />
    </Router>
  );
}

renderApp(Main);
