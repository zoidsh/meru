import { ipc } from "@meru/renderer-lib/ipc";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { XIcon } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Route } from "wouter";
import { navigate } from "wouter/use-hash-location";
import { useSettingsStore } from "@/lib/stores";
import { sidebarNavItems } from "./app-sidebar";

ipc.renderer.on("navigate", (_event, to) => {
  navigate(to);
});

function CloseButton() {
  const closeSettings = () => {
    ipc.main.send("settings.toggleIsOpen");
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
  const isSettingsOpen = useSettingsStore((state) => state.isOpen);

  if (!isSettingsOpen) {
    return;
  }

  return (
    <div className="flex-1 flex relative bg-sidebar">
      <ScrollArea className="flex-1 bg-background rounded-xl m-4 ml-0 relative overflow-hidden border dark:border-none">
        <div className="w-3xl mx-auto py-8 px-28">
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
