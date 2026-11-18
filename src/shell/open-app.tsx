import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import { LayoutGridIcon } from "lucide-react";
import { useId, useState } from "react";

import type { ShellState } from "#contract/shell.ts";
import { filterApps } from "#core/open-app.ts";
import { Button } from "#ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "#ui/command.tsx";
import { Kbd } from "#ui/kbd.tsx";

import { AppIcon } from "./app-icon.tsx";
import { OverlayCard } from "./overlay-card.tsx";
import { useShortcutTitle } from "./shortcut-title.ts";
import { shellCalls, useShellState } from "./sync.ts";
import { TitlebarButton } from "./titlebar-button.tsx";

const focus = (input: HTMLInputElement | null) => {
  input?.focus();
};

/**
 * The apps the profile can open, filtered by what is typed; Up, Down and
 * Enter or a click choose one. The list is filtered here by `filterApps`
 * rather than by cmdk's fuzzy score, so it keeps the registry's order.
 */
export const OpenAppOverlay = ({
  apps,
}: Extract<ShellState["overlay"], { kind: "open-app" }>) => {
  const { t } = useLingui();
  const headingId = useId();
  const [query, setQuery] = useState("");
  const label = t({
    message: "Open app",
    comment:
      "Name and placeholder of the search field over the page that lists Google's apps, to open one as a tab",
  });

  return (
    <OverlayCard kind="open-app" labelledBy={headingId}>
      <h2 id={headingId} className="sr-only">
        {label}
      </h2>
      <Command
        shouldFilter={false}
        label={label}
        className="rounded-none! bg-transparent p-0 [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=command-input-wrapper]]:pb-1"
      >
        <CommandInput
          ref={focus}
          value={query}
          onValueChange={setQuery}
          placeholder={label}
          autoComplete="off"
          spellCheck={false}
          // Not by viewport: this document's is the overlay's own view.
          className="text-sm"
        />
        <CommandList
          label={t({
            message: "Apps",
            comment:
              "Accessible name of the list of Google's apps under the Open app search field, read by screen readers",
          })}
        >
          <CommandEmpty>
            <Trans comment="Said in the list of Google's apps over the page when none has a name holding what was typed">
              No apps found.
            </Trans>
          </CommandEmpty>
          {filterApps(apps, query).map((app) => (
            <CommandItem
              key={app.id}
              value={app.id}
              className="h-8 rounded-[10px]"
              onSelect={() => {
                shellCalls().openApp({ appId: app.id });
              }}
            >
              <AppIcon app={app.id} aria-hidden />
              {app.name}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </OverlayCard>
  );
};

const useOpenAppButton = () => {
  const { t } = useLingui();
  const shortcutTitle = useShortcutTitle();
  const label = t({
    message: "Open app",
    context: "button",
    comment:
      "Name of the button, in the sidebar, the title bar or the page area of a profile with no app open, that lists Google's apps over the page to open one as a tab; also the tooltip of the first two",
  });
  const shortcut = useShellState("shortcuts")?.["app.open"];

  return {
    label,
    shortcut,
    title: shortcutTitle(label, shortcut),
    open: useShellState("overlay")?.kind === "open-app",
    toggle: () => {
      shellCalls().toggleOpenApp({});
    },
  };
};

/** Open app in the title bar, first of its right-hand group, while the sidebar is hidden. */
export const OpenAppTitlebarButton = () => {
  const { label, shortcut, open, toggle } = useOpenAppButton();

  return (
    <TitlebarButton
      data-opens="open-app"
      pressed={open}
      label={label}
      shortcut={shortcut}
      onClick={toggle}
    >
      <LayoutGridIcon />
    </TitlebarButton>
  );
};

/** Open app in the page area of a profile with no tab, its shortcut beside it. */
export const OpenAppPanelButton = ({
  variant,
}: {
  variant: "outline" | "ghost";
}) => {
  const { label, shortcut, open, toggle } = useOpenAppButton();

  return (
    <Button
      data-opens="open-app"
      variant={variant}
      size="sm"
      aria-pressed={open}
      onClick={toggle}
    >
      {label}
      {shortcut && <Kbd aria-hidden>{shortcut}</Kbd>}
    </Button>
  );
};

/** Open app below the sidebar's last tab: a tile when narrow, a row when wide. */
export const OpenAppSidebarButton = ({ wide }: { wide: boolean }) => {
  const { label, title, open, toggle } = useOpenAppButton();

  return (
    <Button
      data-opens="open-app"
      variant={open ? "secondary" : "ghost"}
      size={wide ? "sm" : "icon-sm"}
      aria-pressed={open}
      title={title}
      className={cn(
        "font-medium",
        wide && "w-full justify-start gap-2",
        !open && "text-muted-foreground"
      )}
      onClick={toggle}
    >
      <LayoutGridIcon aria-hidden />
      <span className={wide ? "truncate" : "sr-only"}>{label}</span>
    </Button>
  );
};
