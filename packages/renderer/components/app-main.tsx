import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { XIcon } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Route, useRoute } from "wouter";
import { navigate } from "wouter/use-hash-location";
import { useSettingsStore } from "@/lib/stores";
import { sidebarNavItems } from "./app-sidebar";
import { UnifiedInbox } from "@/routes/unified-inbox";
import { cn } from "@meru/ui/lib/utils";

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
      <div className="text-muted-foreground text-xs font-semibold">ESC</div>
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
    <div className="flex-1 flex relative bg-sidebar">
      <ScrollArea
        className={cn(
          "flex-1 bg-background relative overflow-hidden border dark:border-none",
          !matchUnifiedInboxRoute && "rounded-xl m-4",
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
        {!matchUnifiedInboxRoute && (
          <div className="absolute top-8 right-8">
            <CloseButton />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
