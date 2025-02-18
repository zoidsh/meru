import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BellIcon,
  RotateCwIcon,
  SettingsIcon,
} from "lucide-react";
import { APP_SIDEBAR_WIDTH, APP_TOOLBAR_HEIGHT } from "../../lib/constants";
import {
  useAccounts,
  useAppTitle,
  useGmailNavigationHistory,
  useGmailNavigationHistoryGo,
  useGmailReload,
  useGmailToggleVisible,
  useGmailVisible,
} from "../lib/hooks";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

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
  const gmailNavigationHistoryGo = useGmailNavigationHistoryGo();
  const gmailReload = useGmailReload();
  const gmailVisible = useGmailVisible();

  return (
    <div
      className={cn("flex items-center gap-1", {
        invisible: !gmailVisible.data,
      })}
      // @ts-expect-error
      style={{ appRegion: "none" }}
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
  const gmailToggleVisible = useGmailToggleVisible();
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
      <TitlebarSpacer />
      <div
        className={cn("flex-1 flex justify-between px-2", {
          relative: accounts.data.length > 1,
        })}
      >
        <TitlebarNavigation />
        <TitlebarTitle />
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
    </div>
  );
}
