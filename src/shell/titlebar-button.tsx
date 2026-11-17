import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "#ui/button.tsx";
import { Kbd } from "#ui/kbd.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#ui/tooltip.tsx";

/**
 * An icon button of the titlebar: ghost, or secondary while pressed or its
 * overlay is open, with a tooltip naming it and its shortcut.
 */
export const TitlebarButton = ({
  label,
  tooltip = label,
  shortcut,
  pressed,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "aria-label" | "aria-pressed"> & {
  /** The accessible name. */
  label: string;
  /** What the tooltip says, where it says more than the name. */
  tooltip?: ReactNode;
  /** As the `shortcuts` slice gives it. */
  shortcut?: string | undefined;
  /** Set for a button that is on or off; left out for one that acts. */
  pressed?: boolean;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          variant={pressed ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          className={cn(
            "[app-region:no-drag]",
            !pressed && "text-muted-foreground",
            className
          )}
          {...props}
        />
      }
    >
      {children}
    </TooltipTrigger>
    <TooltipContent side="bottom">
      {tooltip}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </TooltipContent>
  </Tooltip>
);
