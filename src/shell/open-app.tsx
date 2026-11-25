import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import { PlusIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";

import type { ShellState } from "#contract/shell.ts";
import {
  afterRemoving,
  appValue,
  bookmarkOfValue,
  bookmarkValue,
  launcherItems,
} from "#core/open-app.ts";
import { Button } from "#ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "#ui/command.tsx";
import { Kbd } from "#ui/kbd.tsx";

import { AppIcon } from "./app-icon.tsx";
import { keepFocus } from "./keep-focus.ts";
import { OverlayCard } from "./overlay-card.tsx";
import { useShortcutTitle } from "./shortcut-title.ts";
import { shellCalls, useShellState } from "./sync.ts";
import { TitlebarButton } from "./titlebar-button.tsx";
import { TitledOverlay, TitledOverlayBody } from "./titled-overlay.tsx";

const focus = (input: HTMLInputElement | null) => {
  input?.focus();
};

type Launcher = Extract<ShellState["overlay"], { kind: "open-app" }>;

/**
 * New tab, the launcher: the apps the profile can open and its bookmarks,
 * in two groups filtered by what is typed. Up, Down and Enter or a click
 * choose one across both. A bookmark's cross, for the pointer, and
 * Shift+Delete or Shift+Backspace on the highlighted one remove it, the
 * field keeping its text and the focus; the cross is hidden from assistive
 * technology, since a button inside an option can be reached neither by
 * the keyboard nor by a screen reader, and the list says the keys once. The list is filtered here by `launcherItems` rather than by cmdk's
 * fuzzy score, so it keeps each group's order. As Open in split it says so
 * in a header, with where the pick goes.
 */
export const OpenAppOverlay = ({ apps, bookmarks, split }: Launcher) => {
  const { t } = useLingui();
  const headingId = useId();
  const [query, setQuery] = useState("");
  const listed = launcherItems(apps, bookmarks, query);
  const values = [
    ...listed.apps.map((app) => appValue(app.id)),
    ...listed.bookmarks.map((bookmark) => bookmarkValue(bookmark.id)),
  ];
  const [highlighted, setHighlighted] = useState(values[0] ?? "");
  // A line in place of the group's rows, which is no result: typing hides
  // it, as it hides a group with no match.
  const noBookmarksYet = bookmarks.length === 0 && query.trim() === "";
  const appsShown = listed.apps.length > 0;
  const bookmarksShown = listed.bookmarks.length > 0 || noBookmarksYet;
  const label = t({
    message: "New tab",
    comment:
      "Name of the launcher over the page that lists Google's apps and the profile's bookmarks, to open one as a tab",
  });
  const removeLabel = t({
    message: "Remove bookmark",
    comment:
      "Tooltip of the cross on a bookmark's row in the New tab launcher, which deletes that bookmark",
  });

  const remove = (id: string) => {
    setHighlighted(afterRemoving(values, id));
    shellCalls().removeBookmark({ id });
  };

  // Chrome's key for removing a suggestion; plain Delete and Backspace edit.
  const removeHighlighted = (event: React.KeyboardEvent) => {
    const id = bookmarkOfValue(highlighted);

    if (
      event.shiftKey &&
      (event.key === "Delete" || event.key === "Backspace") &&
      id !== undefined &&
      values.includes(highlighted)
    ) {
      event.preventDefault();
      remove(id);
    }
  };

  const command = (
    <Command
      shouldFilter={false}
      label={label}
      value={highlighted}
      onValueChange={setHighlighted}
      onKeyDown={removeHighlighted}
      className={cn(
        "min-h-0",
        // In the titled card, one surface with the Card: no fill, corner or
        // padding of its own, and the field the Card's gap under the header.
        split &&
          "rounded-none! bg-transparent p-0 [&_[data-slot=command-input-wrapper]]:pt-0"
      )}
    >
      <CommandInput
        ref={focus}
        value={query}
        onValueChange={setQuery}
        placeholder={t({
          message: "Open Google app or bookmark",
          comment:
            "Placeholder of the search field of the New tab launcher, which filters Google's apps and the profile's bookmarks",
        })}
        autoComplete="off"
        spellCheck={false}
        // Not by viewport: this document's is the overlay's own view.
        className="text-sm"
      />
      <CommandList
        className="max-h-120 min-h-0"
        label={t({
          message: "Google apps and bookmarks",
          comment:
            "Accessible name of the list under the New tab launcher's search field, read by screen readers",
        })}
        aria-description={t({
          message: "Shift+Delete removes the highlighted bookmark",
          comment:
            "Read by screen readers once for the New tab launcher's list: the key that deletes the bookmark highlighted in it",
        })}
      >
        <CommandEmpty>
          <Trans comment="Said in the New tab launcher when no Google app or bookmark matches what was typed">
            No results.
          </Trans>
        </CommandEmpty>
        {appsShown && (
          <CommandGroup
            heading={t({
              message: "Google apps",
              comment:
                "Heading of the group of Google's apps in the New tab launcher",
            })}
          >
            {listed.apps.map((app) => (
              <CommandItem
                key={app.id}
                value={appValue(app.id)}
                onSelect={() => {
                  shellCalls().openApp({ appId: app.id });
                }}
              >
                <AppIcon app={app.id} aria-hidden />
                {app.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {appsShown && bookmarksShown && (
          // cmdk hides a separator while there is a search, which here
          // filters nothing of its own.
          <CommandSeparator alwaysRender />
        )}
        {bookmarksShown && (
          <CommandGroup
            heading={t({
              message: "Bookmarks",
              comment:
                "Heading of the group of the profile's bookmarks in the New tab launcher",
            })}
          >
            {noBookmarksYet && (
              <p className="flex h-8 items-center px-2 text-sm text-muted-foreground">
                <Trans comment="Muted line in the New tab launcher's Bookmarks group while the profile has no bookmarks; not something to choose">
                  No bookmarks yet
                </Trans>
              </p>
            )}
            {listed.bookmarks.map((bookmark) => (
              <CommandItem
                key={bookmark.id}
                value={bookmarkValue(bookmark.id)}
                onSelect={() => {
                  shellCalls().openBookmark({ id: bookmark.id });
                }}
              >
                <AppIcon app={bookmark.app} aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {bookmark.title}
                </span>
                <CommandShortcut className="flex shrink-0 items-center gap-2 tracking-normal">
                  {bookmark.appName}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    tabIndex={-1}
                    aria-hidden
                    title={removeLabel}
                    className="-my-1 opacity-0 group-data-selected/command-item:opacity-100"
                    onMouseDown={keepFocus}
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(bookmark.id);
                    }}
                  >
                    <XIcon />
                  </Button>
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );

  if (split) {
    return (
      <TitledOverlay
        kind="open-app"
        titleId={headingId}
        title={
          <Trans comment="Heading over the list of Google's apps and bookmarks whose pick opens in a new pane of the split view">
            Open in split
          </Trans>
        }
        description={
          split === "row" ? (
            <Trans comment="Under the Open in split heading: the Google app or bookmark picked opens in a new pane to the right of the focused one">
              Beside the focused pane
            </Trans>
          ) : (
            <Trans comment="Under the Open in split heading: the Google app or bookmark picked opens in a new pane under the focused one">
              Below the focused pane
            </Trans>
          )
        }
      >
        <TitledOverlayBody bleed="command">{command}</TitledOverlayBody>
      </TitledOverlay>
    );
  }

  return (
    <OverlayCard kind="open-app" labelledBy={headingId}>
      <h2 id={headingId} className="sr-only">
        {label}
      </h2>
      {command}
    </OverlayCard>
  );
};

const useOpenAppButton = () => {
  const { t } = useLingui();
  const shortcutTitle = useShortcutTitle();
  const label = t({
    message: "New tab",
    context: "button",
    comment:
      "Name of the button, in the sidebar, the title bar or the page area of a profile with no Google app open, that opens the launcher listing Google's apps and the profile's bookmarks, to open one as a tab; also the tooltip of the first two",
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

/** New tab in the title bar, first of its right-hand group, while the sidebar is hidden. */
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
      <PlusIcon />
    </TitlebarButton>
  );
};

/** New tab in the page area of a profile with no tab, its shortcut beside it. */
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

/** New tab below the sidebar's last tab: a tile when narrow, a row when wide. */
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
      <PlusIcon aria-hidden />
      <span className={wide ? "truncate" : "sr-only"}>{label}</span>
    </Button>
  );
};
