import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Route } from "wouter";
import { DesktopSources } from "./routes/desktop-sources";
import { RecentDownloadHistory } from "./routes/recent-download-history";
import { useHotkeys } from "react-hotkeys-hook";
import { Toaster } from "@meru/ui/components/sonner";
import { useThemeStore } from "@meru/shared/renderer/theme";

export function App() {
  const theme = useThemeStore((state) => state.theme);

  useHotkeys("esc", () => window.close());

  return (
    <>
      <Router hook={useHashLocation}>
        <Route path="/desktop-sources" component={DesktopSources} />
        <Route path="/recent-download-history" component={RecentDownloadHistory} />
      </Router>
      <Toaster theme={theme} />
    </>
  );
}
