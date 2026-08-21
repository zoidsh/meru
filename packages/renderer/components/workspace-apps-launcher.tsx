import { ipc } from "@meru/shared/renderer/ipc";
import {
  type LauncherWorkspaceApp,
  launcherWorkspaceApps,
  resolveWorkspaceAppsLauncherDisplay,
  type WorkspaceAppsLauncherDisplay,
} from "@meru/shared/workspace-apps";
import { Button } from "@meru/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuBackdrop,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
import { cn } from "@meru/ui/lib/utils";
import { LayoutGridIcon } from "lucide-react";
import { type MouseEvent, useState } from "react";
import {
  TitlebarDropdownMenu,
  TitlebarDropdownMenuItem,
  TitlebarIconButton,
} from "@/components/titlebar";
import { WorkspaceAppIcon } from "@/components/workspace-app-icon";
import { useCloseOnWindowBlur } from "@/lib/hooks";
import { getModifierOpenBehavior } from "@/lib/workspace-apps";

function useLauncherApps() {
  const [isOpen, setIsOpen] = useState(false);

  useCloseOnWindowBlur(isOpen, () => {
    setIsOpen(false);
  });

  const getLauncherAppProps = (app: LauncherWorkspaceApp) => ({
    title: launcherWorkspaceApps[app],
    onClick: (event: MouseEvent) => {
      ipc.main.send("workspaceApps.openApp", app, getModifierOpenBehavior(event));

      setIsOpen(false);
    },
    onAuxClick: (event: MouseEvent) => {
      if (event.button === 1) {
        ipc.main.send("workspaceApps.openApp", app, "backgroundTab");

        setIsOpen(false);
      }
    },
  });

  return { isOpen, setIsOpen, getLauncherAppProps };
}

export function WorkspaceAppsLauncher({
  launcherApps,
  display,
  disabled,
}: {
  launcherApps: LauncherWorkspaceApp[];
  display: WorkspaceAppsLauncherDisplay;
  disabled?: boolean;
}) {
  const { isOpen, setIsOpen, getLauncherAppProps } = useLauncherApps();

  if (resolveWorkspaceAppsLauncherDisplay(display, launcherApps.length) === "expanded") {
    return launcherApps.map((app) => (
      <TitlebarIconButton key={app} disabled={disabled} {...getLauncherAppProps(app)}>
        <WorkspaceAppIcon app={app} className="size-4" />
      </TitlebarIconButton>
    ));
  }

  return (
    <TitlebarDropdownMenu
      title="Open workspace app"
      icon={<LayoutGridIcon />}
      side="left"
      disabled={disabled}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      {launcherApps.map((app) => (
        <TitlebarDropdownMenuItem key={app} {...getLauncherAppProps(app)}>
          <WorkspaceAppIcon app={app} className="size-4" />
        </TitlebarDropdownMenuItem>
      ))}
    </TitlebarDropdownMenu>
  );
}

/**
 * Always a single button: the strip is a column of app icons already, so
 * launcher apps laid out inline there would read as tabs rather than as a way
 * to open one. The display setting stays a titlebar concern.
 */
export function VerticalTabsWorkspaceAppsLauncher({
  launcherApps,
  isWide,
}: {
  launcherApps: LauncherWorkspaceApp[];
  isWide: boolean;
}) {
  const { isOpen, setIsOpen, getLauncherAppProps } = useLauncherApps();

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={isWide ? "sm" : "icon"}
            // Colours transition, the box never does: the button takes its new
            // width in the same step the strip does rather than animating into
            // it once the strip has already arrived
            className={cn(
              "text-muted-foreground transition-colors",
              isWide && "w-full justify-start",
            )}
            title="Open app"
          >
            <LayoutGridIcon />
            {isWide && "Open app"}
          </Button>
        }
      />
      <DropdownMenuBackdrop />
      {/* Opens at trigger width so it stays inside the strip — anything wider
          would be painted over by the workspace app view next to it. That
          leaves room for app names only in the wide strip. */}
      <DropdownMenuContent
        align="center"
        collisionPadding={0}
        className={cn("flex flex-col gap-1 p-0.5", !isWide && "w-auto min-w-0")}
      >
        {launcherApps.map((app) => (
          <DropdownMenuItem
            key={app}
            className={cn(!isWide && "justify-center")}
            {...getLauncherAppProps(app)}
          >
            <WorkspaceAppIcon app={app} className="size-4" />
            {isWide && launcherWorkspaceApps[app]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
