import { cn } from "cn";
import { LayoutGridIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import type { Rect } from "../../../core/records/rect.ts";
import { launcher, launcherPushes } from "../../../shared/channels/launcher.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../client-context.tsx";
import { Button } from "../../ui/button.tsx";
import { useTooltip } from "../commands/use-tooltip.ts";

const BUTTON_SIZE = {
  narrow: "icon",
  titlebar: "icon-sm",
  wide: "sm",
} as const;

const rectOf = (element: Element): Rect => {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  const x = Math.floor(left);
  const y = Math.floor(top);
  return {
    height: Math.ceil(bottom) - y,
    width: Math.ceil(right) - x,
    x,
    y,
  };
};

/** The button the launcher opens from, in the titlebar or at the foot of the sidebar; it also answers launcher.open while it is the one showing. */
export const LauncherButton = ({
  place,
}: {
  readonly place: "titlebar" | "narrow" | "wide";
}) => {
  const wide = place === "wide";
  const client = useClient();
  const ref = useRef<HTMLButtonElement>(null);
  const label = msg`Open app`;
  const title = useTooltip(label, "launcher.open");
  const open = () => {
    if (ref.current !== null) {
      client.send(launcher.open, { anchor: rectOf(ref.current) });
    }
  };
  useEffect(() => client.on(launcherPushes.requested, open));
  return (
    <Button
      className={cn(
        "draggable-none text-muted-foreground",
        wide && "w-full justify-start"
      )}
      data-launcher-button=""
      onClick={open}
      ref={ref}
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
