import { cn } from "cn";
import { LayoutGridIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

import { launcherApps, launcherSide } from "../../../core/engines/launcher.ts";
import type { App } from "../../../core/records/app.ts";
import type { Rect } from "../../../core/records/rect.ts";
import { apps } from "../../../shared/apps.ts";
import { launcher, launcherPushes } from "../../../shared/channels/launcher.ts";
import { tabs } from "../../../shared/channels/profiles.ts";
import { stage } from "../../../shared/channels/stage.ts";
import { msg } from "../../../shared/msg.ts";
import { useClient } from "../../chrome-context.tsx";
import { Button } from "../../ui/button.tsx";
import { Input } from "../../ui/input.tsx";
import { Popover, PopoverContent } from "../../ui/popover.tsx";
import { AppIcon } from "../apps/app-icon.tsx";
import { useTooltip } from "../commands/use-tooltip.ts";
import { useProfiles } from "../profiles/use-profiles.ts";
import { useSetting } from "../settings/use-setting.ts";

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

/** The launcher itself, on its own page over the panes, beside the button it was opened from. */
export const Launcher = ({ anchor }: { readonly anchor: Rect }) => {
  const client = useClient();
  const snapshot = useProfiles();
  const profileId = snapshot?.selectedProfileId ?? "";
  const appIds = useSetting("launcher.apps", profileId);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const shown = launcherApps(apps, appIds, query);
  const close = () => {
    client.send(launcher.close, {});
  };

  useEffect(() => {
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("blur", close);
    };
  });

  // A single-instance app has one tab a profile, which its entry brings to the front rather than adding another.
  const open = async (app: App, split: boolean) => {
    const existing =
      app.singleInstance === true
        ? snapshot?.tabs.find(
            (tab) => tab.profileId === profileId && tab.appId === app.id
          )
        : undefined;
    if (existing !== undefined) {
      await client.invoke(tabs.focus, { tabId: existing.id });
    } else if (split) {
      client.send(stage.split, { appId: app.id, orientation: "vertical" });
    } else {
      const added = await client.invoke(tabs.add, { appId: app.id, profileId });
      if (added.ok) {
        await client.invoke(tabs.focus, { tabId: added.value.id });
      }
    }
    close();
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && shown.length > 0) {
      setHighlighted((at) => (at + step + shown.length) % shown.length);
      event.preventDefault();
      return;
    }
    const app = shown[Math.min(highlighted, shown.length - 1)];
    if (event.key === "Enter" && app !== undefined) {
      event.preventDefault();
      void open(app, event.shiftKey);
    }
  };

  return (
    <Popover
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          close();
        }
      }}
      open
    >
      <PopoverContent
        align="end"
        anchor={{
          getBoundingClientRect: () =>
            new DOMRect(anchor.x, anchor.y, anchor.width, anchor.height),
        }}
        className="w-64 gap-1 p-1"
        data-launcher=""
        initialFocus={input}
        side={launcherSide(anchor)}
      >
        <Input
          aria-label={msg`Search apps`}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
          }}
          onKeyDown={keyDown}
          placeholder={msg`Search apps`}
          ref={input}
          value={query}
        />
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {shown.map((app, index) => (
            <button
              data-highlighted={index === highlighted || undefined}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm outline-none",
                index === highlighted && "bg-accent text-accent-foreground"
              )}
              data-app-id={app.id}
              key={app.id}
              onClick={(event: MouseEvent) => {
                void open(app, event.shiftKey);
              }}
              onMouseEnter={() => {
                setHighlighted(index);
              }}
              tabIndex={-1}
              type="button"
            >
              <AppIcon className="size-4" icon={app.icon} />
              {app.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
