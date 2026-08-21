import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { cn } from "@meru/ui/lib/utils";
import { XIcon } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Route, useRoute } from "wouter";
import { navigate } from "wouter/use-hash-location";
import { DownloadHistory } from "@/routes/download-history";
import { UnifiedInbox } from "@/routes/unified-inbox";
import { sidebarNavItems } from "./app-sidebar";

function CloseButton() {
  const closeSettings = () => {
    navigate("/");
  };

  useHotkeys("esc", closeSettings);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={closeSettings}
        className="rounded-full"
        title="Close settings"
      >
        <XIcon />
      </Button>
      <div className="text-xs font-semibold text-muted-foreground">Esc</div>
    </div>
  );
}

export function AppMain() {
  const [matchUnifiedInboxRoute] = useRoute("/unified-inbox");
  const [matchDownloadHistoryRoute] = useRoute("/download-history");

  const isFullWidthRoute = matchUnifiedInboxRoute || matchDownloadHistoryRoute;

  return (
    <div className="relative flex flex-1 bg-sidebar">
      <ScrollArea
        className={cn(
          "relative flex-1 overflow-hidden border bg-background dark:border-none",
          !isFullWidthRoute && "m-4 rounded-xl",
        )}
      >
        <div
          className={cn(
            "mx-auto py-8",
            matchUnifiedInboxRoute
              ? "w-6xl px-8"
              : matchDownloadHistoryRoute
                ? "max-w-2xl px-8"
                : "w-3xl px-28",
          )}
        >
          <Route path="/unified-inbox" component={UnifiedInbox} />
          <Route path="/download-history" component={DownloadHistory} />
          {sidebarNavItems
            .filter((navItem) => navItem.type !== "separator")
            .map(({ path, component }) => (
              <Route key={path} path={path} component={component} />
            ))}
        </div>
        <div className="absolute top-8 right-8">
          <CloseButton />
        </div>
      </ScrollArea>
    </div>
  );
}
