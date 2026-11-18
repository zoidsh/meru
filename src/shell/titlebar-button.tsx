import { cn } from "cn";
import type { ComponentProps } from "react";

import { Button } from "#ui/button.tsx";

import { useShortcutTitle } from "./shortcut-title.ts";

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
  ...props
}: Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "aria-pressed" | "title"
> & {
  /** The accessible name. */
  label: string;
  /** What the tooltip says, where it says more than the name. */
  tooltip?: string;
  /** As the `shortcuts` slice gives it. */
  shortcut?: string | undefined;
  /** Set for a button that is on or off; left out for one that acts. */
  pressed?: boolean;
}) => {
  const shortcutTitle = useShortcutTitle();
  const title = shortcutTitle(tooltip, shortcut);

  return (
    <Button
      variant={pressed ? "secondary" : "ghost"}
      size="icon-sm"
      // Chromium reads a title that differs from the aria-label as the
      // description; an equal one would be read twice, so the title alone
      // names the button then.
      aria-label={title === label ? undefined : label}
      aria-pressed={pressed}
      title={title}
      className={cn(
        "[app-region:no-drag]",
        !pressed && "text-muted-foreground",
        className
      )}
      {...props}
    />
  );
};
