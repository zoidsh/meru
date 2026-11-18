import { useLingui } from "@lingui/react/macro";
import { BookmarkIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import type { KeyboardEvent } from "react";

import type { ShellState } from "#contract/shell.ts";
import { Button } from "#ui/button.tsx";
import {
  Command,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "#ui/command.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#ui/empty.tsx";

import { AppIcon } from "./app-icon.tsx";
import { OverlayCard } from "./overlay-card.tsx";
import { shellCalls, useShellState } from "./sync.ts";
import { TitlebarButton } from "./titlebar-button.tsx";

type Row = Extract<
  ShellState["overlay"],
  { kind: "bookmarks" }
>["bookmarks"][number];

const focus = (element: HTMLDivElement | null) => {
  element?.focus();
};

const keepFocus = (event: { preventDefault: () => void }) => {
  event.preventDefault();
};

/** The row the highlight moves to once `id`'s is removed: the next, else the one before. */
const afterRemoving = (rows: readonly Row[], id: string) => {
  const index = rows.findIndex((row) => row.id === id);

  return (rows[index + 1] ?? rows[index - 1])?.id ?? "";
};

/**
 * The profile's bookmarks, titled, with no search field, as the prototype
 * has it. Up, Down and Enter or a click open one; its cross, or Delete or
 * Backspace on the highlighted row, removes it, the focus staying in the
 * list.
 */
export const BookmarksOverlay = ({
  bookmarks,
}: Extract<ShellState["overlay"], { kind: "bookmarks" }>) => {
  const { t } = useLingui();
  const headingId = useId();
  const emptyId = useId();
  const [highlighted, setHighlighted] = useState(bookmarks[0]?.id ?? "");
  const title = t({
    message: "Bookmarks",
    comment:
      "Title of the overlay over the page that lists the selected profile's bookmarks",
  });
  const removeLabel = t({
    message: "Remove bookmark",
    comment:
      "Accessible name and tooltip of the cross on a row of the Bookmarks overlay, which deletes that bookmark",
  });

  const remove = (id: string) => {
    setHighlighted(afterRemoving(bookmarks, id));
    shellCalls().removeBookmark({ id });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      bookmarks.some((row) => row.id === highlighted)
    ) {
      event.preventDefault();
      remove(highlighted);
    }
  };

  return (
    <OverlayCard kind="bookmarks" labelledBy={headingId}>
      <header className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-3">
        <h2 id={headingId} className="text-base leading-5 font-medium">
          {title}
        </h2>
      </header>
      <div className="-mx-1 h-px shrink-0 bg-foreground/10" />
      <Command
        ref={focus}
        tabIndex={-1}
        shouldFilter={false}
        label={title}
        value={highlighted}
        onValueChange={setHighlighted}
        onKeyDown={onKeyDown}
        aria-describedby={bookmarks.length === 0 ? emptyId : undefined}
        className="min-h-0 rounded-none! bg-transparent p-0 pt-1 outline-none"
      >
        <CommandList className="max-h-none">
          {bookmarks.map((row) => (
            <CommandItem
              key={row.id}
              value={row.id}
              className="h-8 rounded-[10px]"
              onSelect={() => {
                shellCalls().openBookmark({ id: row.id });
              }}
            >
              <AppIcon app={row.app} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{row.title}</span>
              <CommandShortcut className="flex shrink-0 items-center gap-2 tracking-normal">
                {row.appName}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  tabIndex={-1}
                  aria-label={removeLabel}
                  title={removeLabel}
                  className="-my-1 opacity-0 group-hover/command-item:opacity-100 group-data-selected/command-item:opacity-100 hover:bg-secondary"
                  onMouseDown={keepFocus}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(row.id);
                  }}
                >
                  <XIcon />
                </Button>
              </CommandShortcut>
            </CommandItem>
          ))}
        </CommandList>
        {bookmarks.length === 0 && (
          <Empty id={emptyId} className="p-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookmarkIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t({
                  message: "No bookmarks yet",
                  comment:
                    "Heading of the Bookmarks overlay when the selected profile has no bookmarks",
                })}
              </EmptyTitle>
              <EmptyDescription>
                {t({
                  message:
                    "Bookmark a page from its tab's menu or with the shortcut.",
                  comment:
                    "Shown in the Bookmarks overlay when the selected profile has no bookmarks",
                })}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </Command>
    </OverlayCard>
  );
};

/** The titlebar's button that opens the Bookmarks overlay, or closes it. */
export const BookmarksButton = () => {
  const { t } = useLingui();
  const open = useShellState("overlay")?.kind === "bookmarks";
  const shortcut = useShellState("shortcuts")?.["bookmarks.toggle"];

  return (
    <TitlebarButton
      data-opens="bookmarks"
      pressed={open}
      label={t({
        message: "Bookmarks",
        context: "button",
        comment:
          "Accessible name and tooltip of the button in the title bar that lists the selected profile's bookmarks over the page",
      })}
      shortcut={shortcut}
      onClick={() => {
        shellCalls().toggleBookmarks({});
      }}
    >
      <BookmarkIcon />
    </TitlebarButton>
  );
};

/**
 * The star of a tab's own window, first of its titlebar's right-hand group:
 * Bookmark Tab, or Remove Bookmark while filled; none while its page cannot
 * be bookmarked.
 */
export const OwnWindowBookmarkButton = ({
  profileId,
  tabId,
  bookmarked,
}: {
  profileId: string;
  tabId: string;
  bookmarked: boolean | null;
}) => {
  const { t } = useLingui();
  const shortcut = useShellState("shortcuts")?.["tab.bookmark"];

  if (bookmarked === null) {
    return null;
  }

  return (
    <TitlebarButton
      label={
        bookmarked
          ? t({
              message: "Remove bookmark",
              context: "button",
              comment:
                "Accessible name and tooltip of the filled bookmark button in the title bar of a tab's own window, which removes its page's bookmark",
            })
          : t({
              message: "Bookmark tab",
              context: "button",
              comment:
                "Accessible name and tooltip of the bookmark button in the title bar of a tab's own window, which saves its page as a bookmark",
            })
      }
      shortcut={shortcut}
      onClick={() => {
        shellCalls().toggleTabBookmark({ profileId, tabId });
      }}
    >
      <BookmarkIcon className={bookmarked ? "fill-current" : undefined} />
    </TitlebarButton>
  );
};
