import { Tabs } from "@base-ui/react/tabs";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "cn";
import {
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";

import type { ShellState } from "#contract/shell.ts";
import { APPS, findApp, isAppId } from "#core/apps.ts";
import { spansPinnedRow, splitPinned } from "#core/pinned-tabs.ts";
import { sidebarWidth } from "#core/sidebar.ts";
import { Button, buttonVariants } from "#ui/button.tsx";
import { ScrollArea } from "#ui/scroll-area.tsx";

import { AppIcon } from "./app-icon.tsx";
import { isMenuKey, useMenuReturn, wholePoint } from "./context-menu.ts";
import { keepInView } from "./keep-in-view.ts";
import { OpenAppSidebarButton } from "./open-app.tsx";
import { shellCalls, useShellState } from "./sync.ts";
import { useTabDrag } from "./tab-drag.ts";
import { UnreadBadge } from "./unread-badge.tsx";

type ShellTab = ShellState["tabs"]["tabs"][number];

const appName = (app: string) => findApp(APPS, app)?.name ?? app;

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

/** A tile's title, then "asleep" and "sign in required" as they apply. */
const useTooltip = (title: string, asleep: boolean, mustSignIn: boolean) => {
  const { t } = useLingui();

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
  const tiles = [...(tab.parentElement?.children ?? [])];
  const index = tiles.indexOf(tab);
  const other = key === "ArrowRight" ? index + 1 : index - 1;

  // A row holds an even index and the next.
  if ((key === "ArrowRight") === (index % 2 === 0)) {
    (tiles[other] as HTMLElement | undefined)?.focus();
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

interface TabButtonProps {
  tab: ShellTab;
  /** A square tile, or, in the wide list, a row with the title. */
  tile: boolean;
  /** Fills its cell of the wide pinned grid. */
  cell: boolean;
  /** Spans both of the wide pinned grid's columns, alone in its row. */
  spansRow: boolean;
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
}

const TabButton = ({
  tab,
  tile,
  cell,
  spansRow,
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
}: TabButtonProps) => {
  const { t } = useLingui();
  const title = tabTitle(tab);
  const asleep = tab.status.kind === "unloaded";
  const live = tab.status.kind === "live" || asleep;
  const marked = tile && tab.app === "gmail";
  // Unlike the name, which stays the title; Chromium then reads it as the
  // tile's description.
  const tooltip = useTooltip(title, asleep, marked && signedOut);
  const asleepDescription = t({
    message: "Asleep",
    comment:
      "Said by screen readers after a sidebar row's title while its tab sleeps: put to sleep, or not opened yet since Meru started",
  });

  // One element tree in either width, so a tab keeps its element, and with
  // it focus, as the sidebar changes width. A row shows its title in full
  // and needs no tooltip.
  return (
    <Tabs.Tab
      value={tab.id}
      data-tab-id={tab.id}
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
      aria-description={!tile && asleep ? asleepDescription : undefined}
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
        !tile && "w-full justify-start gap-2 pr-8",
        !selected && "text-muted-foreground",
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
      {marked && <GmailMark unreadCount={unreadCount} signedOut={signedOut} />}
    </Tabs.Tab>
  );
};

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
  const wide = state === "wide";
  const gap = wide ? 4 : 8;
  const { pinned, listed } = splitPinned(tabs.tabs);
  const close = (tabId: string) => {
    shellCalls().closeTab({ profileId, tabId });
  };

  // A tab pinned or unpinned moves to the other area and so is drawn anew,
  // which drops the focus it had; the list gives it back to the selected tab.
  const list = useRef<HTMLDivElement>(null);
  const focusInList = useRef(false);
  const pinnedIds = pinned
    .map((tab) => tab.id)
    .toSorted()
    .join(" ");
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

  // Back on the tab its menu was opened on, or the selected tab once that
  // is gone.
  useMenuReturn(
    "tab-menu",
    (menu) => menu.tabId,
    (tabId) => {
      (
        list.current?.querySelector<HTMLElement>(
          `[data-tab-id="${CSS.escape(tabId)}"]`
        ) ??
        list.current?.querySelector<HTMLElement>(
          '[role="tab"][aria-selected="true"]'
        )
      )?.focus();
    }
  );

  // A tab moved by the keyboard, or dragged, keeps focus, which the list
  // drawn in its new order may have dropped, and the keyboard's move is said.
  const sidebar = useRef<HTMLDivElement>(null);
  const moving = useRef<{ tabId: string; announce: boolean }>(undefined);
  // Written in place rather than through state, as the list is drawn.
  const announcement = useRef<HTMLOutputElement>(null);
  const order = tabs.tabs.map((tab) => tab.id).join(" ");
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
      const area = tab.pinned ? pinned : listed;
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

  const moveBy = (tab: ShellTab, step: number) => {
    const area = tab.pinned ? pinned : listed;
    const to = area.indexOf(tab) + step;

    if (to < 0 || to >= area.length) {
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

    move(tab.id, area[step < 0 ? to : to + 1]?.id, true);

    return true;
  };

  const drag = useTabDrag({
    sidebar,
    blocked: overlay !== undefined && overlay.kind !== "none",
    tabIds: tabs.tabs.map((tab) => tab.id),
    onMove: (tabId, before) => {
      move(tabId, before, false);
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

  const button = (tab: ShellTab, tile: boolean, index = 0) => (
    <TabButton
      key={tab.id}
      tab={tab}
      tile={tile}
      cell={wide && tab.pinned}
      spansRow={wide && tab.pinned && spansPinnedRow(index, pinned.length)}
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
        drag.onPointerDown(tab.id, event);
      }}
      isDragClick={drag.isDragClick}
      onMoveBy={(step) => moveBy(tab, step)}
      onSideways={wide && tab.pinned ? sideways : undefined}
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
        {pinned.length > 0 && (
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
              {pinned.map((tab, index) => button(tab, true, index))}
            </div>
          </ScrollArea>
        )}
        {listed.length > 0 && (
          <ScrollArea
            style={{ minHeight: listRoom(listed.length, gap) }}
            className={cn(scroller, "shrink-[1000]")}
          >
            <div className={cn("relative", inset)}>
              <div
                data-tab-area="listed"
                className={cn(
                  "flex flex-col",
                  wide ? "gap-1" : "items-center gap-2"
                )}
              >
                {listed.map((tab) => button(tab, !wide))}
              </div>
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-1.5 flex flex-col",
                  wide ? "gap-1" : "items-center gap-2"
                )}
              >
                {listed.map((tab) => {
                  const title = tabTitle(tab);
                  const label = t({
                    message: `Close ${title}`,
                    comment:
                      "Accessible name of the cross on a tab that closes it; {title} is the tab's title",
                  });

                  return (
                    <div
                      key={tab.id}
                      className={cn(
                        "relative h-8",
                        wide ? "flex items-center justify-end pr-1" : "w-8"
                      )}
                    >
                      {wide ? (
                        <Button
                          variant="secondary"
                          size="icon-xs"
                          tabIndex={-1}
                          aria-label={label}
                          {...hover(tab.id)}
                          onMouseDown={keepFocus}
                          className={cn(
                            "pointer-events-auto opacity-0",
                            hovered === tab.id && "opacity-100"
                          )}
                          onClick={() => {
                            close(tab.id);
                          }}
                        >
                          <XIcon />
                        </Button>
                      ) : (
                        // Below shadcn's smallest button, kept from v3 to
                        // fit a tile's corner.
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={label}
                          {...hover(tab.id)}
                          onMouseDown={keepFocus}
                          className={cn(
                            "pointer-events-auto absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-secondary text-secondary-foreground opacity-0 ring-1 ring-shell [&_svg]:size-2.5",
                            hovered === tab.id && "opacity-100"
                          )}
                          onClick={() => {
                            close(tab.id);
                          }}
                        >
                          <XIcon />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </Tabs.List>
      <output ref={announcement} className="sr-only" />
      {drag.line && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 rounded-[1px] bg-foreground"
          style={{
            left: drag.line.left,
            top: drag.line.top,
            width: drag.line.right - drag.line.left,
            height: drag.line.bottom - drag.line.top,
          }}
        />
      )}
      <div
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

const OFFLINE = "ERR_INTERNET_DISCONNECTED";

type Problem = Extract<ShellTab["status"], { kind: "failed" | "crashed" }>;

const isProblem = (status: ShellTab["status"]): status is Problem =>
  status.kind === "failed" || status.kind === "crashed";

/**
 * Where the selected tab's view would be, which is hidden while its page
 * failed or crashed, so this is what shows. Its heading is also said by a
 * screen reader as it appears, and not again while retries come and go.
 */
export const TabProblem = ({ tabs }: { tabs: ShellState["tabs"] }) => {
  const { t } = useLingui();
  const tab = tabs.tabs.find(
    (candidate) => candidate.id === tabs.selectedTabId
  );
  const status = tab && isProblem(tab.status) ? tab.status : undefined;
  const name = tab ? appName(tab.app) : "";
  let heading: string | undefined;

  if (status?.kind === "crashed") {
    heading = t({
      message: `${name} stopped working`,
      comment:
        "Heading shown in place of a tab's page that crashed; {name} is the app, such as Gmail or Calendar",
    });
  } else if (status?.reason === OFFLINE) {
    heading = t({
      message: "You’re offline",
      comment:
        "Heading shown in place of a tab's page that could not load because the computer is offline",
    });
  } else if (status) {
    heading = t({
      message: `${name} couldn’t load`,
      comment:
        "Heading shown in place of a tab's page that could not load; {name} is the app, such as Gmail or Calendar",
    });
  }

  return (
    <>
      <output className="sr-only">{heading}</output>
      {tab && status && heading && (
        <ProblemPanel
          tabKey={{ profileId: tabs.profileId, tabId: tab.id }}
          name={name}
          status={status}
          heading={heading}
        />
      )}
    </>
  );
};

const ProblemPanel = ({
  tabKey,
  name,
  status,
  heading,
}: {
  tabKey: { profileId: string; tabId: string };
  name: string;
  status: Problem;
  heading: string;
}) => {
  const { t } = useLingui();

  return (
    <section
      aria-labelledby="tab-problem-heading"
      className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <CircleAlertIcon aria-hidden className="size-8 text-muted-foreground" />
      {status.kind === "failed" ? (
        <>
          <h1 id="tab-problem-heading" className="text-lg font-semibold">
            {heading}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {status.reason === OFFLINE ? (
              <Trans comment="Explanation under the offline heading in place of a tab's page; {name} is the app, such as Gmail or Calendar">
                {name} loads by itself when you’re back online.
              </Trans>
            ) : (
              <Trans comment="Explanation under the heading in place of a tab's page that could not load">
                Meru keeps trying by itself.
              </Trans>
            )}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {status.reason}
          </p>
          <Button
            variant="outline"
            disabled={status.retrying}
            onClick={() => {
              shellCalls().retryTab(tabKey);
            }}
          >
            {status.retrying
              ? t({
                  message: "Trying again…",
                  comment:
                    "Label of the disabled button in place of a tab's page while it tries to load the page again",
                })
              : t({
                  message: "Try again",
                  comment:
                    "Button in place of a tab's page that could not load, which tries to load it again now",
                })}
          </Button>
        </>
      ) : (
        <>
          <h1 id="tab-problem-heading" className="text-lg font-semibold">
            {heading}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            <Trans comment="Explanation under the heading in place of a tab's page that crashed">
              Its page quit unexpectedly. Reload it to carry on.
            </Trans>
          </p>
          <Button
            variant="outline"
            onClick={() => {
              shellCalls().retryTab(tabKey);
            }}
          >
            {t({
              message: "Reload",
              comment:
                "Button in place of a tab's page that crashed, which loads the page again",
            })}
          </Button>
        </>
      )}
    </section>
  );
};
