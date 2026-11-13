import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { launcherApps, launcherSide } from "../../../core/engines/launcher.ts";
import type { App } from "../../../core/records/app.ts";
import type { Rect } from "../../../core/records/rect.ts";
import { apps } from "../../../shared/apps.ts";
import { launcher } from "../../../shared/channels/launcher.ts";
import { stage } from "../../../shared/channels/stage.ts";
import { msg } from "../../../shared/msg.ts";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../ui/command.tsx";
import { Popover, PopoverContent } from "../../ui/popover.tsx";
import { AppIcon } from "../apps/app-icon.tsx";
import { useProfiles } from "../profiles/use-profiles.ts";
import { useSetting } from "../settings/use-setting.ts";
import { useLauncherClient } from "./use-launcher-client.ts";

/** The launcher itself, on its own page over the panes, beside the button it was opened from: a search field over the apps, Enter opening the highlighted one and Shift+Enter splitting the focused pane with it. */
export const Launcher = ({ anchor }: { readonly anchor: Rect }) => {
  const client = useLauncherClient();
  const snapshot = useProfiles();
  const appIds = useSetting("launcher.apps");
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState("");
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

  const open = async (app: App, split: boolean) => {
    const profileId = snapshot?.selectedProfileId;
    if (profileId !== undefined) {
      await client.invoke(stage.openTab, { appId: app.id, profileId, split });
    }
    close();
  };

  // cmdk replaces an item's onClick with its own and hands onSelect no event, so Shift is read from the press before it and from the key here; a prevented Enter is one cmdk leaves alone.
  const splitOnSelect = useRef(false);
  const keyDown = (event: KeyboardEvent) => {
    const app = shown.find((found) => found.id === highlighted) ?? shown[0];
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
        className="w-64 p-0"
        data-launcher=""
        side={launcherSide(anchor)}
      >
        <Command
          onKeyDown={keyDown}
          onValueChange={setHighlighted}
          shouldFilter={false}
          value={highlighted}
        >
          <CommandInput
            aria-label={msg`Search apps`}
            autoFocus
            onValueChange={setQuery}
            placeholder={msg`Search apps`}
            value={query}
          />
          <CommandList>
            <CommandEmpty>{msg`No apps found`}</CommandEmpty>
            <CommandGroup>
              {shown.map((app) => (
                <CommandItem
                  data-app-id={app.id}
                  key={app.id}
                  onPointerDown={(event) => {
                    splitOnSelect.current = event.shiftKey;
                  }}
                  onSelect={() => {
                    void open(app, splitOnSelect.current);
                  }}
                  value={app.id}
                >
                  <AppIcon className="size-4" icon={app.icon} />
                  {app.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
