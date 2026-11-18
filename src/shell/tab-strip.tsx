import { Tabs } from "@base-ui/react/tabs";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import {
  AppWindowIcon,
  BookmarkIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  Minimize2Icon,
  XIcon,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";

import type { ShellState } from "#contract/shell.ts";
import { APPS, findApp, isAppId } from "#core/apps.ts";
import { itemTabs, sidebarLayout } from "#core/drawn-tabs.ts";
import type { SidebarItem } from "#core/drawn-tabs.ts";
import { spansPinnedRow } from "#core/pinned-tabs.ts";
import { sidebarWidth } from "#core/sidebar.ts";
import { Button, buttonVariants } from "#ui/button.tsx";
import { ScrollArea } from "#ui/scroll-area.tsx";

import { AppIcon } from "./app-icon.tsx";
import { isMenuKey, wholePoint } from "./context-menu.ts";
import { keepInView } from "./keep-in-view.ts";
import { OpenAppSidebarButton } from "./open-app.tsx";
import { useShortcutTitle } from "./shortcut-title.ts";
import { shellCalls, useShellState } from "./sync.ts";
import { useTabDrag } from "./tab-drag.ts";
import { UnreadBadge } from "./unread-badge.tsx";

type ShellTab = ShellState["tabs"]["tabs"][number];

export const appName = (app: string) => findApp(APPS, app)?.name ?? app;

export const tabTitle = (tab: Pick<ShellTab, "title" | "app">) =>
  tab.title || appName(tab.app);

// The Scroll Area's bar is styled from here, as `src/ui` stays as the CLI
// wrote it: an 8px thumb, shown while the pointer is over a list that
// overflows. Where the component's own classes match as strongly, `!` wins.
const SCROLLBAR = cn(
  "[&_[data-slot=scroll-area-scrollbar]]:w-2! [&_[data-slot=scroll-area-scrollbar]]:border-0! [&_[data-slot=scroll-area-scrollbar]]:p-0",
  "[&_[data-slot=scroll-area-scrollbar]]:opacity-0 [&_[data-slot=scroll-area-scrollbar]]:transition-opacity hover:[&_[data-slot=scroll-area-scrollbar][data-has-overflow-y]]:opacity-100",
  "[&_[data-slot=scroll-area-thumb]]:bg-foreground/20"
);

/** Said after the title, to a screen reader, where the tab is not live. */
const TabStatusIcon = ({ status }: { status: ShellTab["status"] }) => {
  switch (status.kind) {
    case "loading": {
      return (
        <>
          <LoaderCircleIcon aria-hidden className="animate-spin" />
          <span className="sr-only">
            <Trans comment="Said by screen readers after a tab's title while its page loads">
              Loading
            </Trans>
          </span>
        </>
      );
    }
    case "failed": {
      return (
        <>
          <CircleAlertIcon aria-hidden className="text-destructive" />
          <span className="sr-only">
            <Trans comment="Said by screen readers after a tab's title when its page could not load">
              Couldn’t load
            </Trans>
          </span>
        </>
      );
    }
    case "crashed": {
      return (
        <>
          <CircleAlertIcon aria-hidden className="text-destructive" />
          <span className="sr-only">
            <Trans comment="Said by screen readers after a tab's title when its page crashed">
              Stopped working
            </Trans>
          </span>
        </>
      );
    }
    default: {
      return null;
    }
  }
};

/**
 * A tile's title, then "in its own window", "asleep" and "sign in required"
 * as they apply; a tab in its own window never sleeps, and a pinned tile,
 * which Gmail's with its sign-in is, is never in one.
 */
const useTooltip = (
  title: string,
  ownWindow: boolean,
  asleep: boolean,
  mustSignIn: boolean
) => {
  const { t } = useLingui();

  if (ownWindow) {
    return t({
      message: `${title} · in its own window`,
      comment:
        "Tooltip of a tile in the sidebar whose tab was moved to a window of its own; a click brings that window forward; {title} is the tab's title",
    });
  }

  if (asleep && mustSignIn) {
    return t({
      message: `${title} · asleep · sign in required`,
      comment:
        "Tooltip of Gmail's tile in the sidebar while it sleeps and the profile's Google account is signed out; {title} is the tab's title",
    });
  }

  if (asleep) {
    return t({
      message: `${title} · asleep`,
      comment:
        "Tooltip of a tile in the sidebar while its tab sleeps: put to sleep, or not opened yet since Meru started; {title} is the tab's title",
    });
  }

  return mustSignIn
    ? t({
        message: `${title} · sign in required`,
        comment:
          "Tooltip of Gmail's tile in the sidebar while the profile's Google account is signed out; {title} is the tab's title",
      })
    : title;
};

/**
 * What a screen reader says after a tab's title: a row's sleep, or for a
 * tab in a split's box, that and what a tile's tooltip says, which a
 * description given replaces.
 */
const useDescription = ({
  tile,
  ownWindow,
  asleep,
  boxed,
  maximized,
  title,
  tooltip,
}: {
  tile: boolean;
  ownWindow: boolean;
  asleep: boolean;
  boxed: boolean;
  /** Whether the box's split shows its focused pane alone. */
  maximized: boolean;
  title: string;
  tooltip: string;
}) => {
  const { t } = useLingui();
  const asleepDescription = t({
    message: "Asleep",
    comment:
      "Said by screen readers after a sidebar row's title while its tab sleeps: put to sleep, or not opened yet since Meru started",
  });
  const rowDescription = !tile && asleep ? asleepDescription : undefined;

  if (ownWindow) {
    return tile
      ? tooltip
      : t({
          message: "In its own window",
          comment:
            "Said by screen readers after a sidebar row's title while its tab is moved to a window of its own, which a click brings forward",
        });
  }

  if (!boxed) {
    return rowDescription;
  }

  const told = tile && tooltip !== title ? tooltip : rowDescription;

  if (maximized) {
    return told
      ? t({
          message: `${told}, in split view, maximized`,
          comment:
            "Said by screen readers after the title of a tab in the sidebar's split view box while one pane shows alone; {told} is what is said of it otherwise, such as Asleep",
        })
      : t({
          message: "In split view, maximized",
          comment:
            "Said by screen readers after the title of a tab in the sidebar's split view box while the focused pane shows alone, the others hidden until restored",
        });
  }

  return told
    ? t({
        message: `${told}, in split view`,
        comment:
          "Said by screen readers after the title of a tab in the sidebar's split view box; {told} is what is said of it otherwise, such as Asleep",
      })
    : t({
        message: "In split view",
        comment:
          "Said by screen readers after the title of a tab in the sidebar's split view box, whose page is one of the panes shown side by side",
      });
};

/** The tab after or before `tab` in the tablist, to take focus as it closes. */
const neighbourOf = (tab: HTMLElement) => {
  const all = [
    ...(tab
      .closest('[role="tablist"]')
      ?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []),
  ];
  const index = all.indexOf(tab);

  return all[index + 1] ?? all[index - 1];
};

/**
 * The height of `count` tabs, the list keeping room for up to three, and the
 * inset above the first.
 */
const listRoom = (count: number, gap: number) => {
  const rows = Math.min(count, 3);

  return rows === 0 ? 0 : 6 + rows * 32 + (rows - 1) * gap;
};

/** Asks for the tab's context menu at a point of the window. */
const openTabMenu = (
  profileId: string,
  tabId: string,
  x: number,
  y: number
) => {
  shellCalls().openTabMenu({ profileId, tabId, ...wholePoint(x, y) });
};

/** A press that leaves focus where it was, for a control hidden from assistive technology. */
const keepFocus = (event: { preventDefault: () => void }) => {
  event.preventDefault();
};

/** Left or Right on a wide pinned tile: the other tile of its row, if any. */
const sideways = (tab: HTMLElement, key: "ArrowLeft" | "ArrowRight") => {
  // The tiles alone: a split's box before them in the grid is no tile.
  const tiles = [
    ...(tab.parentElement?.querySelectorAll<HTMLElement>(
      ':scope > [role="tab"]'
    ) ?? []),
  ];
  const index = tiles.indexOf(tab);
  const other = key === "ArrowRight" ? index + 1 : index - 1;

  // A row holds an even index and the next.
  if ((key === "ArrowRight") === (index % 2 === 0)) {
    tiles[other]?.focus();
  }
};

/**
 * Alt with Up or Down on a focused tab, or Left or Right on a tile of the
 * wide pinned grid, which moves it a place back or on in its area: Option
 * on macOS. Base UI's tablist leaves arrows with a modifier alone.
 */
const moveStep = (event: KeyboardEvent, grid: boolean) => {
  const steps: Record<string, number> = grid
    ? { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }
    : { ArrowUp: -1, ArrowDown: 1 };

  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    ? steps[event.key]
    : undefined;
};

const tabVariant = (selected: boolean, pinned: boolean) => {
  if (selected) {
    return "secondary";
  }

  return pinned ? "outline" : "ghost";
};

/** At the corner of Gmail's tile: the unread count, or the sign-in mark in its place. */
const GmailMark = ({
  unreadCount,
  signedOut,
}: {
  unreadCount: number;
  signedOut: boolean;
}) =>
  signedOut ? (
    <span
      aria-hidden
      className="pointer-events-none absolute -top-[5px] -right-[5px] flex size-3.5 rounded-full bg-shell text-destructive [&_svg]:size-3.5!"
    >
      <CircleAlertIcon />
    </span>
  ) : (
    <UnreadBadge
      count={unreadCount}
      className="pointer-events-none absolute -top-1.5 -right-2 px-1"
    />
  );

/**
 * The window mark of a tab in its own window: after the title in a row, at
 * the bottom right of a tile.
 */
const OwnWindowMark = ({ shown, tile }: { shown: boolean; tile: boolean }) => {
  if (!shown) {
    return null;
  }

  return tile ? (
    <span
      aria-hidden
      data-own-window-mark
      className="pointer-events-none absolute -right-[3px] -bottom-[3px] flex rounded-[3px] bg-shell text-muted-foreground [&_svg]:size-3!"
    >
      <AppWindowIcon />
    </span>
  ) : (
    <AppWindowIcon
      aria-hidden
      data-own-window-mark
      className="text-muted-foreground"
    />
  );
};

/** Not loaded, so drawn asleep; a tab in its own window never sleeps. */
const isAsleepTab = (tab: ShellTab) =>
  !tab.ownWindow && tab.status.kind === "unloaded";

/** A row's layout, its right end left to its cross, and its bookmark button if `roomy`. */
const rowLayout = (roomy: boolean) =>
  cn("w-full justify-start gap-2", roomy ? "pr-[62px]" : "pr-8");

interface TabButtonProps {
  tab: ShellTab;
  /**
   * The place a drag lands beside, given where the tab stands in its area
   * itself rather than inside a wrapper that carries it.
   */
  dropId?: string | undefined;
  /** A square tile, or, in the wide list, a row with the title. */
  tile: boolean;
  /** Fills its cell of the wide pinned grid. */
  cell: boolean;
  /** Spans both of the wide pinned grid's columns, alone in its row. */
  spansRow: boolean;
  /** In the split's box, whose fill it hovers over in its own shade. */
  boxed: boolean;
  /** In a box whose split shows its focused pane alone. */
  maximized: boolean;
  selected: boolean;
  profileId: string;
  unreadCount: number;
  signedOut: boolean;
  hover: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  };
  onDelete: (tab: HTMLElement) => void;
  /** Starts dragging the tab, should the pointer move far enough. */
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  /** Whether a click ends a drag rather than selecting. */
  isDragClick: () => boolean;
  /** Moves the tab a place back or on in its area; says whether it could. */
  onMoveBy: (step: number) => boolean;
  /** Left or Right on a wide pinned tile, toward the other tile of its row. */
  onSideways?:
    | ((tab: HTMLElement, key: "ArrowLeft" | "ArrowRight") => void)
    | undefined;
  /** A row whose bookmark button shows beside its cross, which needs room for both. */
  roomy?: boolean | undefined;
}

const TabButton = ({
  tab,
  dropId,
  tile,
  cell,
  spansRow,
  boxed,
  maximized,
  selected,
  profileId,
  unreadCount,
  signedOut,
  hover,
  onDelete,
  onPointerDown,
  isDragClick,
  onMoveBy,
  onSideways,
  roomy = false,
}: TabButtonProps) => {
  const title = tabTitle(tab);
  const { ownWindow } = tab;
  const asleep = isAsleepTab(tab);
  const live = tab.status.kind === "live" || asleep;
  const marked = tile && tab.app === "gmail";
  // Unlike the name, which stays the title; Chromium then reads it as the
  // tile's description.
  const tooltip = useTooltip(title, ownWindow, asleep, marked && signedOut);
  const description = useDescription({
    tile,
    ownWindow,
    asleep,
    boxed,
    maximized,
    title,
    tooltip,
  });

  // One element tree in either width, so a tab keeps its element, and with
  // it focus, as the sidebar changes width. A row shows its title in full
  // and needs no tooltip.
  return (
    <Tabs.Tab
      value={tab.id}
      data-tab-id={tab.id}
      data-drop-id={dropId}
      ref={selected ? keepInView : undefined}
      onContextMenu={(event: MouseEvent<HTMLElement>) => {
        event.preventDefault();
        openTabMenu(profileId, tab.id, event.clientX, event.clientY);
      }}
      onPointerDown={onPointerDown}
      onClick={(event) => {
        if (isDragClick()) {
          event.preventBaseUIHandler();

          return;
        }

        // The tabs tell only of a change; asking for the selected tab still
        // shows it in place of the unified inbox.
        if (selected) {
          shellCalls().selectTab({ profileId, tabId: tab.id });
        }
      }}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        const step = moveStep(event, cell);

        // A tab at its area's end leaves the key alone: Alt+Left and
        // Alt+Right are also Back and Forward on Windows and Linux.
        if (step !== undefined && onMoveBy(step)) {
          event.preventDefault();

          return;
        }

        if (isMenuKey(event)) {
          event.preventDefault();

          const { right, top } = event.currentTarget.getBoundingClientRect();

          openTabMenu(profileId, tab.id, right, top);
        }

        if (
          onSideways &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          (event.key === "ArrowLeft" || event.key === "ArrowRight")
        ) {
          event.preventDefault();
          onSideways(event.currentTarget, event.key);
        }

        if (
          !tab.pinned &&
          (event.key === "Delete" || event.key === "Backspace")
        ) {
          event.preventDefault();
          onDelete(event.currentTarget);
        }
      }}
      {...hover}
      title={tile ? tooltip : undefined}
      // A tile's tooltip says so; a row, which has none, is described.
      aria-description={description}
      className={cn(
        buttonVariants({
          variant: tabVariant(selected, tab.pinned),
          size: tile ? "icon-sm" : "sm",
        }),
        // No pressed nudge: a held tab, as in a drag, would push the list's
        // last row a pixel past its viewport, which the Scroll Area then
        // takes for overflow and keeps showing a bar for.
        "relative font-medium active:not-aria-[haspopup]:translate-y-0",
        cell && "w-full",
        spansRow && "col-span-2",
        !tile && rowLayout(roomy),
        !selected && "text-muted-foreground",
        boxed &&
          !selected &&
          "hover:bg-foreground/7 dark:hover:bg-foreground/7",
        asleep && "opacity-50"
      )}
    >
      {(!tile || live) && isAppId(tab.app) && (
        <AppIcon app={tab.app} aria-hidden />
      )}
      <span className={tile ? "sr-only" : "min-w-0 flex-1 truncate text-left"}>
        {title}
      </span>
      <TabStatusIcon status={tab.status} />
      <OwnWindowMark shown={ownWindow} tile={tile} />
      {marked && <GmailMark unreadCount={unreadCount} signedOut={signedOut} />}
    </Tabs.Tab>
  );
};

interface Hover {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

/**
 * Whether a listed tab's wide row has a bookmark button: its page can be
 * bookmarked and shows in the main window.
 */
export const hasBookmarkButton = (tab: ShellTab, wide: boolean) =>
  wide && !tab.pinned && !tab.ownWindow && tab.bookmarked !== null;

/**
 * A row's bookmark button, at its right end with the cross moved beside it:
 * shown on hover, and kept at rest, its icon filled and muted, while the
 * tab's page is bookmarked.
 */
const RowBookmarkButton = ({
  profileId,
  tab,
  hovered,
  hover,
  shortcut,
}: {
  profileId: string;
  tab: ShellTab;
  hovered: boolean;
  hover: Hover;
  /** Bookmark Tab's, named while the tab is the one it acts on. */
  shortcut: string | undefined;
}) => {
  const { t } = useLingui();
  const shortcutTitle = useShortcutTitle();
  const title = tabTitle(tab);
  const on = tab.bookmarked === true;
  const tooltip = on
    ? t({
        message: "Remove bookmark",
        comment:
          "Tooltip of the filled bookmark button on a tab's row in the wide sidebar, which removes its page's bookmark",
      })
    : t({
        message: "Bookmark tab",
        comment:
          "Tooltip of the bookmark button on a tab's row in the wide sidebar, which saves its page as a bookmark",
      });

  return (
    <Button
      variant="secondary"
      size="icon-xs"
      tabIndex={-1}
      aria-label={
        on
          ? t({
              message: `Remove bookmark of ${title}`,
              comment:
                "Accessible name of the filled bookmark button on a tab's row; {title} is the tab's title",
            })
          : t({
              message: `Bookmark ${title}`,
              comment:
                "Accessible name of the bookmark button on a tab's row, which saves its page as a bookmark; {title} is the tab's title",
            })
      }
      aria-pressed={on}
      title={shortcutTitle(tooltip, shortcut)}
      {...hover}
      onMouseDown={keepFocus}
      className={cn(
        "pointer-events-auto opacity-0 [&_svg]:size-3",
        (hovered || on) && "opacity-100",
        on && !hovered && "bg-transparent text-muted-foreground",
        on && "[&_svg]:fill-current"
      )}
      onClick={() => {
        shellCalls().toggleTabBookmark({ profileId, tabId: tab.id });
      }}
    >
      <BookmarkIcon />
    </Button>
  );
};

/**
 * A listed tab with its cross, and in a wide row its bookmark button,
 * which lie over it for the pointer alone, out of the tab order and hidden
 * from assistive technology, since a tablist holds only tabs.
 */
const ListedTab = ({
  profileId,
  tab,
  wide,
  hovered,
  hover,
  onClose,
  bookmarkShortcut,
  children,
}: {
  profileId: string;
  tab: ShellTab;
  wide: boolean;
  /** Whether the pointer is over the tab or its cross, which shows it. */
  hovered: boolean;
  hover: Hover;
  onClose: () => void;
  bookmarkShortcut: string | undefined;
  /** The tab's own button. */
  children: ReactNode;
}) => {
  const { t } = useLingui();
  const title = tabTitle(tab);
  const closeLabel = t({
    message: `Close ${title}`,
    comment:
      "Accessible name of the cross on a tab that closes it; {title} is the tab's title",
  });

  return (
    <div
      data-drop-id={tab.id}
      className={cn("relative", wide ? "w-full" : "w-8")}
    >
      {children}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0",
          wide && "flex items-center justify-end gap-1 pr-1"
        )}
      >
        {wide ? (
          <>
            <Button
              variant="secondary"
              size="icon-xs"
              tabIndex={-1}
              aria-label={closeLabel}
              {...hover}
              onMouseDown={keepFocus}
              className={cn(
                "pointer-events-auto opacity-0",
                hovered && "opacity-100"
              )}
              onClick={onClose}
            >
              <XIcon />
            </Button>
            {hasBookmarkButton(tab, wide) && (
              <RowBookmarkButton
                profileId={profileId}
                tab={tab}
                hovered={hovered}
                hover={hover}
                shortcut={bookmarkShortcut}
              />
            )}
          </>
        ) : (
          // Below shadcn's smallest button, kept from v3 to fit a tile's
          // corner.
          <button
            type="button"
            tabIndex={-1}
            aria-label={closeLabel}
            {...hover}
            onMouseDown={keepFocus}
            className={cn(
              "pointer-events-auto absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-secondary text-secondary-foreground opacity-0 ring-1 ring-shell [&_svg]:size-2.5",
              hovered && "opacity-100"
            )}
            onClick={onClose}
          >
            <XIcon />
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * A split's box: its pinned tabs as tiles, then its other tabs, then,
 * while the split shows one pane alone, the button that restores the rest,
 * selecting `restoring`. Its tabs are not the area's own, so a drag passes
 * them by; in the list the box is one place to land above or below,
 * standing for its first stored tab, and in the pinned area, where the
 * boxes come first, none.
 */
const SplitBox = ({
  tabs,
  profileId,
  restoring,
  wide,
  maximized,
  dropId,
  tile,
  listed,
}: {
  /** The box's tabs, in its own order. */
  tabs: ShellTab[];
  profileId: string;
  restoring: ShellTab | undefined;
  wide: boolean;
  maximized: boolean;
  dropId: string | undefined;
  tile: (
    tab: ShellTab,
    cell?: { spansRow: boolean; grid: boolean }
  ) => ReactNode;
  listed: (tab: ShellTab) => ReactNode;
}) => {
  const { t } = useLingui();
  const shortcuts = useShellState("shortcuts");
  const shortcutTitle = useShortcutTitle();
  const pinned = tabs.filter((tab) => tab.pinned);
  const restoreLabel = t({
    message: "Restore panes",
    comment:
      "Accessible name and tooltip of the button in the sidebar's box of a split view, while one pane shows alone, that shows every pane again",
  });

  return (
    <div
      data-split-box
      data-maximized={maximized || undefined}
      data-drop-id={dropId}
      className={cn(
        // Only a fill reaching into the gaps around it, so its tabs keep
        // the stack's column and pitch; a box right after another starts
        // where its gap does, so their edges stand as far apart as a box's
        // from a tab.
        "-mx-[3px] flex flex-col rounded-[12px] px-[3px] [[data-split-box]+&]:mt-0",
        wide ? "-my-px py-px" : "-my-[3px] py-[3px]",
        maximized
          ? "bg-[color-mix(in_oklch,var(--color-shell),var(--background)_85%)]"
          : "bg-[color-mix(in_oklch,var(--color-shell),var(--background)_55%)]",
        wide ? "col-span-2 gap-1" : "items-center gap-2"
      )}
    >
      {wide && pinned.length > 1 ? (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {pinned.map((tab, index) =>
            tile(tab, {
              spansRow: spansPinnedRow(index, pinned.length),
              grid: true,
            })
          )}
        </div>
      ) : (
        pinned.map((tab) => tile(tab))
      )}
      {tabs.filter((tab) => !tab.pinned).map(listed)}
      {/* Out of the tab order and hidden from assistive technology, as a
          tab's cross is, since a tablist holds only tabs; Restore Panes in
          the menu and its shortcut reach it from the keyboard. */}
      {maximized && restoring && (
        <Button
          variant="ghost"
          size={wide ? "sm" : "icon-sm"}
          aria-hidden
          aria-label={wide ? undefined : restoreLabel}
          tabIndex={-1}
          title={shortcutTitle(restoreLabel, shortcuts?.["tab.maximize"])}
          onMouseDown={keepFocus}
          onClick={() => {
            shellCalls().maximizePane({
              profileId,
              tabId: restoring.id,
              on: false,
            });
          }}
          className={cn(
            "font-medium text-muted-foreground",
            wide && "w-full justify-start gap-2"
          )}
        >
          <Minimize2Icon />
          {wide && (
            <span className="min-w-0 flex-1 truncate text-left">
              <Trans comment="Label of the button in the wide sidebar's box of a split view while one pane shows alone; a click shows every pane again">
                Maximized · Restore
              </Trans>
            </span>
          )}
        </Button>
      )}
    </div>
  );
};

/**
 * Whether an overlay is open that a tab drag cannot start or go on under;
 * what a drag over the pages shows is an overlay of its own.
 */
const blocksDrag = (overlay: ShellState["overlay"] | undefined) =>
  overlay !== undefined && overlay.kind !== "none" && overlay.kind !== "drop";

/**
 * The selected profile's tabs, down the left below the titlebar: the pinned
 * ones in the pinned area at the top, as tiles in either width, then the rest
 * in the list, square tiles when narrow and rows with their titles when
 * wide. The two scroll apart and are one tablist, so the arrow keys go from
 * one into the other. Built on Base UI's tabs directly, since the shadcn
 * component does not hand its orientation to them, which a vertical list's
 * arrow keys need.
 *
 * A close button is not part of its tab, and lies over the list for the
 * pointer alone, hidden from assistive technology, since nothing but tabs
 * may be in a tablist: Delete or Backspace closes the focused tab, and Close
 * Tab the selected one.
 */
export const Sidebar = ({
  tabs,
  state,
  unreadCount,
  signedOut,
}: {
  tabs: ShellState["tabs"];
  state: "narrow" | "wide";
  /** The profile's unread mail, shown on Gmail's tile. */
  unreadCount: number;
  /** Whether the profile's Google account is signed out, marked on Gmail's tile. */
  signedOut: boolean;
}) => {
  const { t } = useLingui();
  const { profileId } = tabs;
  const [hovered, setHovered] = useState<string>();
  const shortcuts = useShellState("shortcuts");
  const wide = state === "wide";
  const gap = wide ? 4 : 8;
  const pinned = tabs.tabs.filter((tab) => tab.pinned);
  const layout = sidebarLayout(
    tabs.tabs,
    tabs.boxes.map((box) => box.tabs)
  );
  const boxOfTab = new Map(
    layout.boxes.flatMap((box) => box.map((tab) => [tab.id, box] as const))
  );
  const boxed = new Set(boxOfTab.keys());
  const boxRowsOf = (tab: ShellTab) =>
    (boxOfTab.get(tab.id) ?? []).filter((each) => !each.pinned);
  // Boxes in the pinned area come first, so no tab moves past them.
  const pinnedBoxes = layout.pinned.flatMap((item) =>
    item.kind === "box" ? [item.tabs] : []
  );
  const listedBoxes = layout.listed.filter((item) => item.kind === "box");
  const pinnedTabs = layout.pinned.flatMap((item) =>
    item.kind === "tab" ? [item] : []
  );
  // Where a tab moved beside a box lands: next to its first stored tab,
  // since the box stands where that one does.
  const firstOf = (box: readonly ShellTab[]) =>
    tabs.tabs.find((tab) => box.includes(tab))?.id;
  const placeOf = (item: SidebarItem<ShellTab> | undefined) =>
    item?.kind === "box" ? firstOf(item.tabs) : item?.tab.id;
  const maximizedOf = (box: readonly ShellTab[]) =>
    tabs.boxes.find((each) => each.tabs.includes(box[0]?.id ?? ""))
      ?.maximized === true;
  const areaOf = (tab: ShellTab) => (tab.pinned ? pinnedTabs : layout.listed);
  const close = (tabId: string) => {
    shellCalls().closeTab({ profileId, tabId });
  };

  // A tab pinned or unpinned moves to the other area, and one put in the box
  // or taken out moves into or out of it, and so is drawn anew, which drops
  // the focus it had; the list gives it back to the selected tab.
  const list = useRef<HTMLDivElement>(null);
  const focusInList = useRef(false);
  const pinnedIds = [
    ...pinned.map((tab) => tab.id).toSorted(),
    ...layout.boxes.flatMap((box) => [
      "in a box:",
      ...box.map((tab) => tab.id).toSorted(),
    ]),
  ].join(" ");
  const drawnPinned = useRef(pinnedIds);

  useLayoutEffect(() => {
    if (drawnPinned.current === pinnedIds) {
      return;
    }

    drawnPinned.current = pinnedIds;

    if (
      focusInList.current &&
      document.hasFocus() &&
      document.activeElement === document.body
    ) {
      list.current
        ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.focus();
    }
  });

  const overlay = useShellState("overlay");

  // A tab moved by the keyboard, or dragged, keeps focus, which the list
  // drawn in its new order may have dropped, and the keyboard's move is said.
  const sidebar = useRef<HTMLDivElement>(null);
  const moving = useRef<{ tabId: string; announce: boolean }>(undefined);
  // Written in place rather than through state, as the list is drawn.
  const announcement = useRef<HTMLOutputElement>(null);
  // The boxes' order too, which a move within one changes alone.
  const order = [
    ...tabs.tabs.map((tab) => tab.id),
    ...layout.boxes.flatMap((box) => [
      "in a box:",
      ...box.map((tab) => tab.id),
    ]),
  ].join(" ");
  const drawnOrder = useRef(order);

  useLayoutEffect(() => {
    if (drawnOrder.current === order) {
      return;
    }

    drawnOrder.current = order;

    const moved = moving.current;

    moving.current = undefined;

    const tab = tabs.tabs.find((candidate) => candidate.id === moved?.tabId);

    if (!moved || !tab) {
      return;
    }

    const element = list.current?.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(tab.id)}"]`
    );

    if (element && document.activeElement === document.body) {
      element.focus();
    }

    if (moved.announce) {
      const area = boxed.has(tab.id)
        ? boxRowsOf(tab)
        : itemTabs(areaOf(tab).filter((item) => item.kind === "tab"));
      const title = tabTitle(tab);
      const position = area.indexOf(tab) + 1;
      const count = area.length;

      announcement.current?.replaceChildren(
        t({
          message: `${title}, position ${position} of ${count}`,
          comment:
            "Said by screen readers after a tab is moved with the keyboard; {title} is the tab's title, {position} its place among the pinned tabs or the other tabs, and {count} how many there are",
        })
      );
    }
  });

  const move = (
    tabId: string,
    before: string | undefined,
    announce: boolean
  ) => {
    moving.current = { tabId, announce };
    shellCalls().moveTab({
      profileId,
      tabId,
      ...(before !== undefined && { before }),
    });
  };

  const moveInBox = (tabId: string, before: string | undefined) => {
    shellCalls().moveInBox({
      profileId,
      tabId,
      ...(before !== undefined && { before }),
    });
  };

  const moveBy = (tab: ShellTab, step: number) => {
    // A pinned tab in a box keeps its place; another moves among the
    // box's others, its pane with it.
    if (boxed.has(tab.id) && tab.pinned) {
      return false;
    }

    const inBox = boxed.has(tab.id);
    const boxRows = boxRowsOf(tab);
    const area = areaOf(tab);
    const to =
      (inBox
        ? boxRows.indexOf(tab)
        : area.findIndex((item) => item.kind === "tab" && item.tab === tab)) +
      step;
    const length = inBox ? boxRows.length : area.length;

    if (to < 0 || to >= length) {
      const title = tabTitle(tab);

      announcement.current?.replaceChildren(
        step < 0
          ? t({
              message: `${title}, already first`,
              comment:
                "Said by screen readers when a tab cannot move up with the keyboard, being first among the pinned tabs or the other tabs; {title} is the tab's title",
            })
          : t({
              message: `${title}, already last`,
              comment:
                "Said by screen readers when a tab cannot move down with the keyboard, being last among the pinned tabs or the other tabs; {title} is the tab's title",
            })
      );

      return false;
    }

    if (inBox) {
      moving.current = { tabId: tab.id, announce: true };
      moveInBox(tab.id, boxRows[step < 0 ? to : to + 1]?.id);
    } else {
      move(tab.id, placeOf(area[step < 0 ? to : to + 1]), true);
    }

    return true;
  };

  const drag = useTabDrag({
    sidebar,
    blocked: blocksDrag(overlay),
    tabIds: tabs.tabs.map((tab) => tab.id),
    onAim: (tabId, point) => {
      shellCalls().aimTab({ profileId, tabId, point: point ?? null });
    },
    onDrop: (tabId, drop) => {
      switch (drop.kind) {
        case "view": {
          shellCalls().dropTab({ profileId, tabId, x: drop.x, y: drop.y });
          break;
        }
        case "onto": {
          shellCalls().splitOntoTab({ profileId, tabId, target: drop.target });
          break;
        }
        case "box": {
          moving.current = { tabId, announce: false };
          moveInBox(tabId, drop.before);
          break;
        }
        default: {
          move(tabId, drop.before, false);
        }
      }
    },
  });

  const hover = (tabId: string) => ({
    onPointerEnter: () => {
      setHovered(tabId);
    },
    onPointerLeave: () => {
      setHovered((current) => (current === tabId ? undefined : current));
    },
  });

  const button = (
    tab: ShellTab,
    tile: boolean,
    {
      spansRow = false,
      grid = false,
      dropId = undefined as string | undefined,
      roomy = false,
    } = {}
  ) => (
    <TabButton
      key={tab.id}
      tab={tab}
      dropId={dropId}
      tile={tile}
      cell={wide && tab.pinned}
      spansRow={spansRow}
      boxed={boxed.has(tab.id)}
      maximized={maximizedOf(boxOfTab.get(tab.id) ?? [])}
      selected={tab.id === tabs.selectedTabId}
      profileId={profileId}
      unreadCount={unreadCount}
      signedOut={signedOut}
      hover={hover(tab.id)}
      onDelete={(element) => {
        neighbourOf(element)?.focus();
        close(tab.id);
      }}
      onPointerDown={(event) => {
        drag.onPointerDown(tab.id, tab.pinned, event);
      }}
      isDragClick={drag.isDragClick}
      onMoveBy={(step) => moveBy(tab, step)}
      onSideways={grid ? sideways : undefined}
      roomy={roomy}
    />
  );

  const listedTab = (tab: ShellTab) => (
    <ListedTab
      key={tab.id}
      profileId={profileId}
      tab={tab}
      wide={wide}
      hovered={hovered === tab.id}
      hover={hover(tab.id)}
      onClose={() => {
        close(tab.id);
      }}
      bookmarkShortcut={
        tab.id === tabs.selectedTabId ? shortcuts?.["tab.bookmark"] : undefined
      }
    >
      {button(tab, !wide, {
        roomy: hovered === tab.id && hasBookmarkButton(tab, wide),
      })}
    </ListedTab>
  );

  // Keyed by its place among the area's boxes, which a move within it
  // keeps, so a moved tab keeps its focus; a split has no id of its own.
  const box = (tabsOfBox: ShellTab[], inList: boolean, place: number) => (
    <SplitBox
      key={`split box ${inList ? "listed" : "pinned"} ${place}`}
      tabs={tabsOfBox}
      profileId={profileId}
      restoring={
        tabsOfBox.find((tab) => tab.id === tabs.selectedTabId) ?? tabsOfBox[0]
      }
      wide={wide}
      maximized={maximizedOf(tabsOfBox)}
      dropId={inList ? firstOf(tabsOfBox) : undefined}
      tile={(tab, cell) => button(tab, true, cell)}
      listed={listedTab}
    />
  );

  const widthLabel = wide
    ? t({
        message: "Narrow sidebar",
        comment:
          "Accessible name and tooltip of the button at the foot of the wide list of tabs that makes it narrow, showing icons alone",
      })
    : t({
        message: "Widen sidebar",
        comment:
          "Accessible name and tooltip of the button at the foot of the narrow list of tabs that makes it wide, showing each tab's title",
      });

  // Reaching into the sidebar's padding far enough to centre the bar in it,
  // and above the first tab, padded back inside the viewport so the tabs stay
  // where they were and a mark or cross at a corner is not clipped.
  const scroller = cn("-mt-1.5 min-h-0", wide ? "-mr-2.5" : "-mr-3", SCROLLBAR);
  const inset = cn("pt-1.5", wide ? "pr-2.5" : "pr-3");

  return (
    <Tabs.Root
      ref={sidebar}
      data-tinted
      orientation="vertical"
      value={tabs.selectedTabId}
      onValueChange={(tabId: string) => {
        shellCalls().selectTab({ profileId, tabId });
      }}
      style={{ width: sidebarWidth(state) }}
      className={cn(
        "group/sidebar flex min-h-0 shrink-0 flex-col py-3",
        wide ? "px-3" : "px-4"
      )}
    >
      <Tabs.List
        ref={list}
        onFocus={() => {
          focusInList.current = true;
        }}
        onBlur={(event) => {
          // Focus lost to nothing, as when its tab is drawn anew, stays the
          // list's; only focus taken elsewhere leaves it.
          if (
            event.relatedTarget !== null &&
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            focusInList.current = false;
          }
        }}
        aria-label={t({
          message: "Tabs",
          comment:
            "Accessible name of the list of the profile's tabs down the left of the window, read by screen readers",
        })}
        className={cn("flex min-h-0 shrink flex-col", wide ? "gap-1" : "gap-2")}
      >
        {layout.pinned.length > 0 && (
          <ScrollArea className={cn(scroller, "shrink")}>
            {/* One parent in either width, so a tile keeps its element,
                and with it focus, as the width changes. */}
            <div
              data-tab-area="pinned"
              className={cn(
                wide
                  ? "grid grid-cols-2 gap-x-2 gap-y-1"
                  : "flex flex-col items-center gap-2",
                inset
              )}
            >
              {pinnedBoxes.map((each, place) => box(each, false, place))}
              {pinnedTabs.map(({ tab }, index) =>
                button(tab, true, {
                  // Counted among the tiles alone: the box takes its own row.
                  spansRow: wide && spansPinnedRow(index, pinnedTabs.length),
                  grid: wide,
                  dropId: tab.id,
                })
              )}
            </div>
          </ScrollArea>
        )}
        {layout.listed.length > 0 && (
          <ScrollArea
            style={{
              minHeight: listRoom(itemTabs(layout.listed).length, gap),
            }}
            className={cn(scroller, "shrink-[1000]")}
          >
            <div
              data-tab-area="listed"
              className={cn(
                "flex flex-col",
                wide ? "gap-1" : "items-center gap-2",
                inset
              )}
            >
              {layout.listed.map((item) =>
                item.kind === "box"
                  ? box(item.tabs, true, listedBoxes.indexOf(item))
                  : listedTab(item.tab)
              )}
            </div>
          </ScrollArea>
        )}
      </Tabs.List>
      <output ref={announcement} className="sr-only" />
      {drag.mark && (
        <div
          aria-hidden
          data-drag-mark={drag.mark.kind}
          className={cn(
            "pointer-events-none fixed z-50",
            drag.mark.kind === "line"
              ? "rounded-[1px] bg-foreground"
              : "rounded-md shadow-[inset_0_0_0_2px_var(--foreground)]"
          )}
          style={{
            left: drag.mark.box.left,
            top: drag.mark.box.top,
            width: drag.mark.box.right - drag.mark.box.left,
            height: drag.mark.box.bottom - drag.mark.box.top,
          }}
        />
      )}
      <div
        data-list-end
        className={cn("flex shrink-0", wide ? "pt-1" : "justify-center pt-2")}
      >
        <OpenAppSidebarButton wide={wide} />
      </div>
      <div
        className={cn(
          "mt-auto flex pt-2 opacity-0 transition-opacity group-hover/sidebar:opacity-100 has-focus-visible:opacity-100",
          wide ? "justify-end" : "justify-center"
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          // Its title names it; an equal aria-label would be read twice,
          // as name and description.
          title={widthLabel}
          className="text-muted-foreground"
          onClick={() => {
            shellCalls().toggleSidebarWidth({});
          }}
        >
          {wide ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
        </Button>
      </div>
    </Tabs.Root>
  );
};
