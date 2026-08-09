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

/**
 * Fades the launcher in when it takes over a host and out when it hands over,
 * without either host having to keep it mounted: `transition-discrete` holds
 * the `display` flip until the fade has played, and `starting:` supplies the
 * transparent state it fades in from.
 */
export const WORKSPACE_APPS_LAUNCHER_FADE_CLASS_NAME =
  "transition-[opacity,display] transition-discrete duration-150 starting:opacity-0";

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
      title="Workspace Apps"
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
            size="icon"
            className={cn(isWide && "w-full")}
            title="Workspace Apps"
          >
            <LayoutGridIcon />
          </Button>
        }
      />
      <DropdownMenuBackdrop />
      {/* Opens upward at trigger width so it stays inside the strip — anything
          wider would be painted over by the workspace app view next to it. */}
      <DropdownMenuContent
        side="top"
        align="center"
        collisionPadding={0}
        className="flex w-auto min-w-0 flex-col gap-1 p-0.5"
      >
        {launcherApps.map((app) => (
          <DropdownMenuItem key={app} className="justify-center" {...getLauncherAppProps(app)}>
            <WorkspaceAppIcon app={app} className="size-4" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
