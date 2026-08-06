import { useThemeStore } from "@meru/shared/renderer/theme";
import { Toaster } from "@meru/ui/components/sonner";
import { useHotkeys } from "react-hotkeys-hook";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { AppMain } from "@/components/app-main";
import { AppTitlebar } from "@/components/app-titlebar";
import { WorkspaceApp } from "@/routes/workspace-app";
import { AppSidebar } from "./components/app-sidebar";
import { AppTabStrip } from "./components/app-tab-strip";
import { useMouseAccountSwitching } from "./lib/hooks";
import { DesktopSources } from "./routes/desktop-sources";
import { RecentDownloadHistory } from "./routes/recent-download-history";

function PopupWindow({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((state) => state.theme);

  useHotkeys("esc", () => window.close());

  return (
    <>
      {children}
      <Toaster theme={theme} />
    </>
  );
}

export function App() {
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
        <Route path="/workspace-app" component={WorkspaceApp} />
        <Route path="/popups/desktop-sources">
          <PopupWindow>
            <DesktopSources />
          </PopupWindow>
        </Route>
        <Route path="/popups/recent-download-history">
          <PopupWindow>
            <RecentDownloadHistory />
          </PopupWindow>
        </Route>
        <Route path="/main/*?">
          <div className="flex h-screen flex-col">
            <AppTitlebar />
            <div className="flex flex-1 overflow-hidden">
              <AppTabStrip />
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
