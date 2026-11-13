import { cn } from "cn";
import type { ComponentProps } from "react";

import { Button } from "../../ui/button.tsx";

// Window chrome takes no tab stop, as a browser's does not: Tab belongs to the page in front, and every control here is also a command in the menu.
/** An icon button on the titlebar, which the window is not dragged by. */
export const TitlebarIconButton = ({
  className,
  ...props
}: ComponentProps<typeof Button>) => (
  <Button
    className={cn("draggable-none", className)}
    size="icon-sm"
    tabIndex={-1}
    variant="ghost"
    {...props}
  />
);
