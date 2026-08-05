import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import { ArrowLeftIcon, ArrowRightIcon, LoaderCircleIcon, RotateCwIcon, XIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export function Titlebar({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative border-b bg-background select-none draggable"
      style={{ height: APP_TITLEBAR_HEIGHT }}
    >
      <div
        className="absolute top-0 bottom-0 flex items-center justify-between px-1.5"
        style={{
          left: "env(titlebar-area-x, 0)",
          width: "env(titlebar-area-width, 100%)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function TitlebarLeft({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

export function TitlebarRight({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

export function TitlebarButtonGroup({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

export function TitlebarPageTitle({ children }: { children: string }) {
  return (
    <div className="max-w-xs truncate text-xs" title={children}>
      {children}
    </div>
  );
}

export function TitlebarIconButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="icon-sm" className={cn("draggable-none", className)} {...props} />
  );
}

export function TitlebarNavigationControls({
  canGoBack,
  canGoForward,
  isLoading,
  disabled,
  onGoBack,
  onGoForward,
  onReload,
  onStop,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  disabled?: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onStop: () => void;
}) {
  const [isReloadHovered, setIsReloadHovered] = useState(false);

  return (
    <>
      <TitlebarIconButton title="Back" disabled={disabled || !canGoBack} onClick={onGoBack}>
        <ArrowLeftIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        title="Forward"
        disabled={disabled || !canGoForward}
        onClick={onGoForward}
      >
        <ArrowRightIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        title={isLoading ? "Stop" : "Reload"}
        disabled={disabled}
        onMouseEnter={() => setIsReloadHovered(true)}
        onMouseLeave={() => setIsReloadHovered(false)}
        onClick={isLoading ? onStop : onReload}
      >
        {isLoading ? (
          isReloadHovered ? (
            <XIcon />
          ) : (
            <LoaderCircleIcon className="animate-spin" />
          )
        ) : (
          <RotateCwIcon />
        )}
      </TitlebarIconButton>
    </>
  );
}
