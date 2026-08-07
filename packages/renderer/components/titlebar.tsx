import { APP_TITLEBAR_HEIGHT } from "@meru/shared/constants";
import { Button } from "@meru/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuBackdrop,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
import { cn } from "@meru/ui/lib/utils";
import { ArrowLeftIcon, ArrowRightIcon, LoaderCircleIcon, RotateCwIcon, XIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";

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

export function TitlebarTitle({ children }: { children: string }) {
  return (
    <div
      className="absolute top-1/2 left-1/2 max-w-xs -translate-x-1/2 -translate-y-1/2 truncate text-xs"
      title={children}
    >
      {children}
    </div>
  );
}

export function TitlebarIconButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="icon-sm" className={cn("draggable-none", className)} {...props} />
  );
}

export function TitlebarDropdownMenu({
  title,
  icon,
  side = "right",
  disabled,
  isOpen,
  onOpenChange,
  children,
}: {
  title: string;
  icon: ReactNode;
  side?: "left" | "right";
  disabled?: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleWindowBlur = () => {
      onOpenChange(false);
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isOpen, onOpenChange]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange} orientation="horizontal">
      <DropdownMenuTrigger
        render={
          <TitlebarIconButton title={title} disabled={disabled}>
            {icon}
          </TitlebarIconButton>
        }
      />
      <DropdownMenuBackdrop className="draggable-none" />
      <DropdownMenuContent
        side={side}
        align="center"
        collisionPadding={0}
        className="flex w-auto min-w-0 flex-row gap-1 p-0.5 draggable-none"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TitlebarDropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuItem>) {
  return <DropdownMenuItem className={cn("h-7 justify-center", className)} {...props} />;
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
