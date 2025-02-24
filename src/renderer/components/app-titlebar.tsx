import {
  ArrowLeftIcon,
  ArrowRightIcon,
  RotateCwIcon,
  SettingsIcon,
} from "lucide-react";
import { APP_SIDEBAR_WIDTH, APP_TOOLBAR_HEIGHT } from "../../lib/constants";
import {
  useAccounts,
  useAppTitle,
  useGmailNavigationHistory,
  useGmailVisible,
  useIsWindowMaximized,
} from "../lib/hooks";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import type { HTMLAttributes } from "react";
import { trpc } from "../lib/trpc";
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from "./ui/icons";

function WindowControlButton({
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      variant="ghost"
      className={cn("rounded-none", className)}
      style={{ width: APP_TOOLBAR_HEIGHT, height: APP_TOOLBAR_HEIGHT }}
      {...props}
    />
  );
}

function WindowControls() {
  const controlWindow = trpc.window.control.useMutation();
  const isWindowMaximized = useIsWindowMaximized();

  return (
    <div
      className="flex"
      // @ts-expect-error
      style={{ appRegion: "none" }}
    >
      <WindowControlButton onClick={() => controlWindow.mutate("minimize")}>
        <MinimizeIcon />
      </WindowControlButton>
      <WindowControlButton
        onClick={() =>
          controlWindow.mutate(
            isWindowMaximized.data ? "unmaximize" : "maximize"
          )
        }
      >
        {isWindowMaximized.data ? <RestoreIcon /> : <MaximizeIcon />}
      </WindowControlButton>
      <WindowControlButton
        className="hover:bg-destructive/90"
        onClick={() => controlWindow.mutate("close")}
      >
        <CloseIcon />
      </WindowControlButton>
    </div>
  );
}

function TitlebarSpacer() {
  return <div style={{ width: APP_SIDEBAR_WIDTH }} />;
}

function TitlebarTitle() {
  const appTitle = useAppTitle();
  const gmailVisible = useGmailVisible();

  if (!gmailVisible.data) {
    return;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs pointer-events-none">
      {appTitle.data}
    </div>
  );
}

function TitlebarNavigation() {
  const gmailNavigationHistory = useGmailNavigationHistory();
  const gmailNavigationHistoryGo = trpc.gmail.navigationHistoryGo.useMutation();
  const gmailReload = trpc.gmail.reload.useMutation();
  const gmailVisible = useGmailVisible();

  return (
    <div
      className={cn("flex items-center gap-1", {
        invisible: !gmailVisible.data,
      })}
      style={{
        // @ts-expect-error
        appRegion: "none",
        marginLeft:
          window.platform === "darwin" ? APP_SIDEBAR_WIDTH : undefined,
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => {
          gmailNavigationHistoryGo.mutate("back");
        }}
        disabled={!gmailNavigationHistory.data?.canGoBack}
      >
        <ArrowLeftIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => {
          gmailNavigationHistoryGo.mutate("forward");
        }}
        disabled={!gmailNavigationHistory.data?.canGoForward}
      >
        <ArrowRightIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => {
          gmailReload.mutate();
        }}
      >
        <RotateCwIcon />
      </Button>
    </div>
  );
}

export function AppTitlebar() {
  const gmailToggleVisible = trpc.gmail.toggleVisible.useMutation();
  const accounts = useAccounts();

  return (
    <div
      style={{
        minHeight: APP_TOOLBAR_HEIGHT,
        // @ts-expect-error
        appRegion: "drag",
      }}
      className={cn("flex border-b select-none", {
        relative: accounts.data.length === 1,
      })}
    >
      <TitlebarTitle />
      <div
        className={cn("flex-1 flex justify-between px-2", {
          relative: accounts.data.length > 1,
        })}
      >
        <TitlebarNavigation />
        <div
          className="flex items-center gap-1"
          // @ts-expect-error
          style={{ appRegion: "none" }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => {
              gmailToggleVisible.mutate();
            }}
          >
            <SettingsIcon />
          </Button>
        </div>
      </div>
      {window.platform !== "darwin" && <WindowControls />}
    </div>
  );
}
