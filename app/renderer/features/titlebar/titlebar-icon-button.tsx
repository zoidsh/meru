import { cn } from "cn";
import type { ComponentProps } from "react";

import { Button } from "../../ui/button.tsx";

/** An icon button on the titlebar, which the window is not dragged by; it takes no tab stop, as a browser's chrome does not, since Tab belongs to the page in front. */
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
