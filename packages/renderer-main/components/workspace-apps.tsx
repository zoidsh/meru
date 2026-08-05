import { ipc } from "@meru/shared/renderer/ipc";
import { useConfig } from "@meru/shared/renderer/react-query";
import { bookmarkableWorkspaceApps } from "@meru/shared/workspace-apps";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
import { WorkspaceAppIcon } from "@meru/ui/components/workspace-app-icon";
import { cn } from "@meru/ui/lib/utils";
import { type ComponentProps, type ReactElement, useEffect, useState } from "react";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { getModifierOpenBehavior } from "@/lib/workspace-apps";

export function BookmarkedWorkspaceAppsMenu({
  trigger,
  orientation,
  side,
  align,
  showAppLabels,
  className,
}: {
  trigger: ReactElement;
  orientation: ComponentProps<typeof DropdownMenu>["orientation"];
  side: ComponentProps<typeof DropdownMenuContent>["side"];
  align: ComponentProps<typeof DropdownMenuContent>["align"];
  showAppLabels: boolean;
  className?: string;
}) {
  const { config } = useConfig();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleWindowBlur = () => {
      setIsOpen(false);
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isOpen]);

  if (!config || !isLicenseKeyValid || config["workspaceApps.bookmarkedApps"].length === 0) {
    return;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} orientation={orientation}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        side={side}
        align={align}
        className={cn(
          orientation === "horizontal" ? "flex w-auto min-w-0 flex-row gap-1" : "space-y-1",
          className,
        )}
      >
        {config["workspaceApps.bookmarkedApps"].map((app) => (
          <DropdownMenuItem
            key={app}
            className={showAppLabels ? undefined : "justify-center"}
            title={bookmarkableWorkspaceApps[app]}
            onClick={(event) => {
              ipc.main.send("workspaceApps.openApp", app, getModifierOpenBehavior(event));
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                ipc.main.send("workspaceApps.openApp", app, "backgroundTab");

                setIsOpen(false);
              }
            }}
          >
            <WorkspaceAppIcon app={app} className="size-4" />
            {showAppLabels && bookmarkableWorkspaceApps[app]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
