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
import type { NavigationAction } from "../../../core/records/navigation.ts";
import { stage } from "../../../shared/channels/stage.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../chrome-context.tsx";
import { useSidebar } from "../sidebar/use-sidebar.ts";
import { useStage } from "../stage/use-stage.ts";
import { ProfileRow } from "./profile-row.tsx";
import { TitlebarIconButton } from "./titlebar-icon-button.tsx";

/** Back, forward and reload for the focused pane; reload is stop while it loads. */
const NavigationControls = () => {
  const client = useClient();
  const navigation = useStage()?.navigation ?? null;
  const [reloadHovered, setReloadHovered] = useState(false);
  const go = (action: NavigationAction) => () => {
    client.send(stage.navigate, { action });
  };
  const loading = navigation?.loading ?? false;
  const reloadIcon = reloadHovered ? (
    <XIcon />
  ) : (
    <LoaderCircleIcon className="animate-spin" />
  );
  return (
    <div className="flex shrink-0 items-center gap-1">
      <TitlebarIconButton
        disabled={navigation?.canGoBack !== true}
        onClick={go("back")}
        title={msg`Go back`}
      >
        <ArrowLeftIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        disabled={navigation?.canGoForward !== true}
        onClick={go("forward")}
        title={msg`Go forward`}
      >
        <ArrowRightIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        disabled={navigation === null}
        onClick={go(loading ? "stop" : "reload")}
        onMouseEnter={() => {
          setReloadHovered(true);
        }}
        onMouseLeave={() => {
          setReloadHovered(false);
        }}
        title={loading ? msg`Stop loading` : msg`Reload page`}
      >
        {loading ? reloadIcon : <RotateCwIcon />}
      </TitlebarIconButton>
    </div>
  );
};

/** The bar across the top of the window, which drags it everywhere but on its controls; `trailing` shows at its right end while the sidebar is hidden. */
export const Titlebar = ({ trailing }: { readonly trailing?: ReactNode }) => {
  const sidebar = useSidebar();
  return (
    <header
      className="draggable bg-background relative shrink-0 overflow-hidden border-b select-none"
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
