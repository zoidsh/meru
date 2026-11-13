import { cn } from "cn";
import { LayoutGridIcon } from "lucide-react";

import { launcher } from "../../../shared/channels/launcher.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../client-context.tsx";
import { Button } from "../../ui/button.tsx";
import { useTooltip } from "../commands/use-tooltip.ts";

const BUTTON_SIZE = {
  narrow: "icon",
  titlebar: "icon-sm",
  wide: "sm",
} as const;

/** The button the launcher opens from, in the titlebar or at the foot of the sidebar. */
export const LauncherButton = ({
  place,
}: {
  readonly place: "titlebar" | "narrow" | "wide";
}) => {
  const wide = place === "wide";
  const client = useClient();
  const label = msg`Open app`;
  const title = useTooltip(label, "launcher.open");
  return (
    <Button
      className={cn(
        "draggable-none text-muted-foreground",
        wide && "w-full justify-start"
      )}
      data-launcher-button=""
      onClick={() => {
        client.send(launcher.open, {});
      }}
      size={BUTTON_SIZE[place]}
      tabIndex={-1}
      title={title}
      variant="ghost"
    >
      <LayoutGridIcon />
      {wide ? label : null}
    </Button>
  );
};
