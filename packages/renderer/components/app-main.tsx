import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { cn } from "@meru/ui/lib/utils";
import { XIcon } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Route, useRoute } from "wouter";
import { navigate } from "wouter/use-hash-location";
import { useSettingsStore } from "@/lib/stores";
import { UnifiedInbox } from "@/routes/unified-inbox";
import { sidebarNavItems } from "./app-sidebar";

ipc.renderer.on("navigate", (_event, to) => {
  navigate(to);
});

function CloseButton() {
  const closeSettings = () => {
    ipc.main.send("settings.toggleIsOpen", false);
  };

  useHotkeys("esc", closeSettings);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="outline" size="icon" onClick={closeSettings} className="rounded-full">
        <XIcon />
      </Button>
      <div className="text-xs font-semibold text-muted-foreground">ESC</div>
    </div>
  );
}

export function AppMain() {
  const [matchUnifiedInboxRoute] = useRoute("/unified-inbox");

  const isSettingsOpen = useSettingsStore((state) => state.isOpen);

  if (!isSettingsOpen) {
    return;
  }

  return (
    <div className="relative flex flex-1 bg-sidebar">
      <ScrollArea
        className={cn(
          "relative flex-1 overflow-hidden border bg-background dark:border-none",
          !matchUnifiedInboxRoute && "m-4 rounded-xl",
        )}
      >
        <div className={cn("mx-auto py-8", matchUnifiedInboxRoute ? "w-6xl px-8" : "w-3xl px-28")}>
          {matchUnifiedInboxRoute ? (
            <UnifiedInbox />
          ) : (
            sidebarNavItems
              .filter((navItem) => navItem.type !== "separator")
              .map(({ path, component }) => <Route key={path} path={path} component={component} />)
          )}
        </div>
        <div className="absolute top-8 right-8">
          <CloseButton />
        </div>
      </ScrollArea>
    </div>
  );
}
