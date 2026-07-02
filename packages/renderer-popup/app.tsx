import { useThemeStore } from "@meru/shared/renderer/theme";
import { Toaster } from "@meru/ui/components/sonner";
import { useHotkeys } from "react-hotkeys-hook";
import { Router } from "wouter";
import { Route } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { DesktopSources } from "./routes/desktop-sources";
import { RecentDownloadHistory } from "./routes/recent-download-history";

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
