import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { launcherApps } from "../../../core/engines/launcher.ts";
import type { App } from "../../../core/records/app.ts";
import { apps } from "../../../shared/apps.ts";
import { launcher } from "../../../shared/channels/launcher.ts";
import { stage } from "../../../shared/channels/stage.ts";
import { msg } from "../../../shared/msg.ts";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../ui/command.tsx";
import { AppIcon } from "../apps/app-icon.tsx";
import { useProfiles } from "../profiles/use-profiles.ts";
import { useSetting } from "../settings/use-setting.ts";
import { useLauncherClient } from "./use-launcher-client.ts";

/** The launcher itself, on its own page over the panes, centred over the window: a search field over the apps, Enter opening the highlighted one and Shift+Enter splitting the focused pane with it. */
export const Launcher = () => {
  const client = useLauncherClient();
  const snapshot = useProfiles();
  const appIds = useSetting("launcher.apps");
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState<string | undefined>();
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
    <CommandDialog
      className="w-80"
      description={msg`Pick a Google app to open`}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          close();
        }
      }}
      open
      title={msg`Open app`}
    >
      <Command
        onKeyDown={keyDown}
        onValueChange={setHighlighted}
        shouldFilter={false}
        // cmdk takes the empty string for no highlighted item.
        value={highlighted ?? ""}
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
    </CommandDialog>
  );
};
