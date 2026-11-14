import { cn } from "cn";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  LoaderCircleIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { TITLEBAR_HEIGHT } from "../../../core/engines/chrome.ts";
import { STYLE_METRICS } from "../../../core/engines/layout.ts";
import { commands } from "../../../shared/channels/commands.ts";
import type { CommandId } from "../../../shared/commands/registry.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../client-context.tsx";
import { useTooltip } from "../commands/use-tooltip.ts";
import { useSetting } from "../settings/use-setting.ts";
import { useSidebar } from "../sidebar/use-sidebar.ts";
import { useStage } from "../stage/use-stage.ts";
import { ProfileRow } from "./profile-row.tsx";
import { TitlebarIconButton } from "./titlebar-icon-button.tsx";

/** Back, forward and reload for the focused pane, each running its command; reload is stop while the pane loads. */
const NavigationControls = () => {
  const client = useClient();
  const navigation = useStage()?.navigation ?? null;
  const [reloadHovered, setReloadHovered] = useState(false);
  const run = (id: CommandId) => () => {
    void client.invoke(commands.run, { id });
  };
  const loading = navigation?.loading ?? false;
  const back = useTooltip(msg`Go back`, "stage.back");
  const forward = useTooltip(msg`Go forward`, "stage.forward");
  const reload = useTooltip(msg`Reload page`, "stage.reload");
  const reloadIcon = reloadHovered ? (
    <XIcon />
  ) : (
    <LoaderCircleIcon className="animate-spin" />
  );
  return (
    <div className="flex shrink-0 items-center gap-1">
      <TitlebarIconButton
        disabled={navigation?.canGoBack !== true}
        onClick={run("stage.back")}
        title={back}
      >
        <ArrowLeftIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        disabled={navigation?.canGoForward !== true}
        onClick={run("stage.forward")}
        title={forward}
      >
        <ArrowRightIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        disabled={navigation === null}
        onClick={run(loading ? "stage.stop" : "stage.reload")}
        onMouseEnter={() => {
          setReloadHovered(true);
        }}
        onMouseLeave={() => {
          setReloadHovered(false);
        }}
        title={loading ? msg`Stop loading` : reload}
      >
        {loading ? reloadIcon : <RotateCwIcon />}
      </TitlebarIconButton>
    </div>
  );
};

/** The bar across the top of the window, which drags it everywhere but on its controls; `trailing` shows at its right end while the sidebar is hidden. */
export const Titlebar = ({ trailing }: { readonly trailing?: ReactNode }) => {
  const sidebar = useSidebar();
  const { seams } = STYLE_METRICS[useSetting("appearance.style")];
  return (
    <header
      className={cn(
        "draggable bg-chrome relative shrink-0 overflow-hidden select-none",
        seams && "border-b"
      )}
      data-titlebar=""
      style={{ height: TITLEBAR_HEIGHT }}
    >
      {/* The window controls the platform draws take the rest of the bar, which env(titlebar-area-*) leaves out. */}
      <div
        className="absolute top-0 bottom-0 flex items-center gap-2 px-1.5"
        style={{
          left: "env(titlebar-area-x, 0)",
          width: "env(titlebar-area-width, 100%)",
        }}
      >
        <NavigationControls />
        <ProfileRow />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {sidebar.kind === "hidden" ? trailing : undefined}
        </div>
      </div>
    </header>
  );
};
