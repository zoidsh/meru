import { useLingui } from "@lingui/react/macro";
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
import { type ComponentProps, type ReactNode, type Ref, useState } from "react";
import { useChromeMenu } from "@/lib/chrome-menu";
import { useCloseOnWindowBlur } from "@/lib/hooks";

/**
 * The titlebar is window chrome, so nothing in it is a tab stop: Tab belongs to
 * whatever is in front, the way it does in a browser's page. Every control here
 * is reachable from the application menu instead, and each one still takes a
 * click. The exceptions carry their own note: the app menu button, which is the
 * keyboard's way into the menu on Windows and Linux, and the find field, which
 * a shortcut opens and the keyboard then works inside.
 */
export function Titlebar({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative overflow-hidden border-b bg-background select-none draggable"
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
  return <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>;
}

export function TitlebarRight({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

/**
 * The right-hand controls, pinned over the right edge of the titlebar instead of
 * sharing a row with what is to their left.
 *
 * Whatever is to their left can then be a scroll container that shrinks to
 * nothing, rather than a row that pushes these controls out of the window. It is
 * opaque so that the content scrolls under it.
 */
export function TitlebarRightOverlay({
  ref,
  children,
}: {
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      ref={ref}
      className="absolute top-0 right-0 flex items-center gap-4 bg-background px-1.5"
      style={{ height: APP_TITLEBAR_HEIGHT }}
    >
      {children}
    </div>
  );
}

export function TitlebarButtonGroup({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("flex items-center gap-1", className)}>{children}</div>;
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
    <Button
      variant="ghost"
      size="icon-sm"
      tabIndex={-1}
      className={cn("draggable-none", className)}
      {...props}
    />
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
  const { rootProps, triggerProps, contentProps } = useChromeMenu(isOpen, onOpenChange);

  useCloseOnWindowBlur(isOpen, () => {
    onOpenChange(false);
  });

  return (
    <DropdownMenu {...rootProps} orientation="horizontal">
      <DropdownMenuTrigger
        {...triggerProps}
        render={
          <TitlebarIconButton title={title} disabled={disabled}>
            {icon}
          </TitlebarIconButton>
        }
      />
      <DropdownMenuBackdrop className="draggable-none" />
      <DropdownMenuContent
        {...contentProps}
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
  const { t } = useLingui();

  const [isReloadHovered, setIsReloadHovered] = useState(false);

  return (
    <>
      <TitlebarIconButton title={t`Go back`} disabled={disabled || !canGoBack} onClick={onGoBack}>
        <ArrowLeftIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        title={t`Go forward`}
        disabled={disabled || !canGoForward}
        onClick={onGoForward}
      >
        <ArrowRightIcon />
      </TitlebarIconButton>
      <TitlebarIconButton
        title={isLoading ? t`Stop loading` : t`Reload page`}
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
