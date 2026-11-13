import { cn } from "cn";
import { ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";

import type { SidebarSize } from "../../../core/engines/sidebar.ts";
import { commands } from "../../../shared/channels/commands.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../client-context.tsx";
import { Button } from "../../ui/button.tsx";
import { useTooltip } from "../commands/use-tooltip.ts";

/** The button at the sidebar's foot that puts it on its other width. */
export const WidthToggle = ({ size }: { readonly size: SidebarSize }) => {
  const client = useClient();
  const wide = size === "wide";
  const title = useTooltip(
    wide ? msg`Narrow the sidebar` : msg`Widen the sidebar`,
    "sidebar.toggleWidth"
  );
  return (
    <Button
      className={cn("text-muted-foreground", wide && "self-end")}
      data-width-toggle=""
      onClick={() => {
        void client.invoke(commands.run, { id: "sidebar.toggleWidth" });
      }}
      size="icon"
      tabIndex={-1}
      title={title}
      variant="ghost"
    >
      {wide ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
    </Button>
  );
};
