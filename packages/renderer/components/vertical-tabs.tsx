import { move } from "@dnd-kit/helpers";
import { type DragEndEvent, DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { VERTICAL_TABS_WIDE_WIDTH } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import type { AccountConfig } from "@meru/shared/schemas";
import { GMAIL_TAB_ID, getTabSection, type TabState } from "@meru/shared/tabs";
import { workspaceApps } from "@meru/shared/workspace-apps";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { cn } from "@meru/ui/lib/utils";
import {
  AppWindowIcon,
  BookOpenIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CircleAlertIcon,
  MergeIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode, Ref } from "react";
import { TabIcon } from "@/components/tab-icon";
import { UnreadCountBadge } from "@/components/unread-count-badge";
import { VerticalTabsWorkspaceAppsLauncher } from "@/components/workspace-apps-launcher";
import { sortablePlugins, sortableSensors } from "@/lib/dnd";
import { useIsLicenseKeyValid, useVerticalTabs } from "@/lib/hooks";
import { useConfig } from "@/lib/react-query";
import { HOST_HANDOVER_FADE_CLASS_NAME } from "@/lib/utils";
import { getModifierOpenBehavior } from "@/lib/workspace-apps";

function moveSectionTab(
  accountId: AccountConfig["id"],
  sectionTabs: TabState[],
  event: DragEndEvent,
) {
  if (event.canceled) {
    return;
  }

  const sectionTabIds = sectionTabs.map((tab) => tab.id);

  const movedSectionTabIds = move(sectionTabIds, event);

  if (movedSectionTabIds === sectionTabIds) {
    return;
  }

  const movedTabId = event.operation.source?.id;

  if (typeof movedTabId !== "string") {
    return;
  }

  ipc.main.send("tabs.moveTab", accountId, movedTabId, movedSectionTabIds.indexOf(movedTabId));
}

function TabBadge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute flex size-4 items-center justify-center rounded-full bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

function WindowedTabBadge({ className }: { className?: string }) {
  return (
    <TabBadge className={className}>
      <AppWindowIcon className="size-2.5" />
    </TabBadge>
  );
}

/**
 * It takes the corner opposite the windowed badge, so a tab that is both keeps
 * each mark to itself. Which app it stands for is left to the tab's tooltip —
 * the tab keeps the designation after browsing elsewhere, so the mark alone
 * cannot say.
 */
function AppLinksTabBadge({ className }: { className?: string }) {
  return (
    <TabBadge className={className}>
      <MergeIcon className="size-2.5" />
    </TabBadge>
  );
}

type GmailTabStatus = {
  attentionRequired: boolean;
  unreadCount: number | null;
};

function GmailTabStatusBadge({ attentionRequired, unreadCount }: GmailTabStatus) {
  if (attentionRequired) {
    return (
      <CircleAlertIcon className="pointer-events-none absolute -top-1 -right-1 size-3.5 rounded-full bg-background text-yellow-400" />
    );
  }

  if (!unreadCount) {
    return null;
  }

  return (
    <UnreadCountBadge
      unreadCount={unreadCount}
      className="pointer-events-none absolute -top-1 -right-1"
    />
  );
}

function VerticalTab({
  ref,
  tab,
  accountId,
  presentation,
  gmailStatus,
  className,
}: {
  ref?: Ref<HTMLDivElement>;
  tab: TabState;
  accountId: AccountConfig["id"];
  presentation: "wideRow" | "narrowIcon" | "gridIcon";
  gmailStatus?: GmailTabStatus;
  className?: string;
}) {
  const { config } = useConfig();

  const isPinnedSectionTab = getTabSection(tab) === "pinned";

  const isCloseable = !isPinnedSectionTab && !tab.dormant;

  const isWideRow = presentation === "wideRow";

  /**
   * The same toggle a workspace app window carries in its titlebar. Only the
   * wide row has the space for it — the other presentations keep the context
   * menu.
   */
  const isBookmarkable = isWideRow && !tab.dormant && Boolean(tab.app);

  /**
   * A bookmarked row shows its star at rest, on the row's edge, so the room for
   * one control is held from the start.
   */
  const showsRestingStar = isBookmarkable && tab.bookmarked;

  const canOpenSecondInstance = tab.app && !workspaceApps[tab.app].singleInstance;

  const showsAppLinksBadge = Boolean(
    config?.["verticalTabs.showAppLinksBadge"] && tab.opensLinksForApp,
  );

  const tooltip = tab.opensLinksForApp
    ? `${tab.title} — Opens ${workspaceApps[tab.opensLinksForApp].label} Links`
    : tab.title;

  return (
    <div ref={ref} className={cn("group relative", className)}>
      <Button
        variant={tab.active ? "secondary" : !isWideRow && isPinnedSectionTab ? "outline" : "ghost"}
        size={isWideRow ? "sm" : "icon"}
        className={cn(
          // Colours transition, the box never does. The hover controls take
          // their room instantly rather than over a transition, and the tab
          // takes the shape its new presentation gives it in the same step the
          // strip changes width, rather than animating into it once the strip
          // has already arrived.
          "transition-colors",
          tab.dormant && "opacity-50",
          isWideRow && "w-full justify-start",
          isWideRow && isBookmarkable && "group-hover:pr-13",
          isWideRow && !isBookmarkable && isCloseable && "group-hover:pr-7",
          showsRestingStar && "pr-7",
          presentation === "gridIcon" && "w-full",
        )}
        title={tooltip}
        onClick={(event) => {
          const modifierOpenBehavior = getModifierOpenBehavior(event);

          if (canOpenSecondInstance && tab.app && modifierOpenBehavior) {
            ipc.main.send("workspaceApps.openApp", tab.app, modifierOpenBehavior);

            return;
          }

          ipc.main.send("tabs.selectTab", accountId, tab.id);
        }}
        onAuxClick={(event) => {
          if (event.button === 1 && isCloseable) {
            ipc.main.send("tabs.closeTab", accountId, tab.id);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();

          ipc.main.send("tabs.showTabContextMenu", accountId, tab.id);
        }}
      >
        <TabIcon app={tab.app} />
        {isWideRow && (
          <span className="min-w-0 flex-1 overflow-hidden mask-r-from-[calc(100%-1.5rem)] text-left whitespace-nowrap">
            {tab.title}
          </span>
        )}
        {isWideRow && showsAppLinksBadge && (
          <MergeIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
        {isWideRow && tab.windowed && (
          <AppWindowIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
      </Button>
      {!isWideRow && tab.windowed && <WindowedTabBadge className="-right-1 -bottom-1" />}
      {!isWideRow && showsAppLinksBadge && <AppLinksTabBadge className="-bottom-1 -left-1" />}
      {gmailStatus && <GmailTabStatusBadge {...gmailStatus} />}
      {/*
       * A bookmarked row keeps this button on show at rest, stripped back to
       * its star, so the mark and the control it stands for are one thing.
       */}
      {isBookmarkable && (
        <Button
          variant="secondary"
          size="icon"
          data-sortable-action
          className={cn(
            // Centred with margins rather than a transform, which the button's
            // own press nudge would overwrite
            "absolute inset-y-0 right-1 my-auto size-5 transition-colors",
            tab.bookmarked
              ? "bg-transparent text-muted-foreground group-hover:bg-secondary group-hover:text-secondary-foreground"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
          title={tab.bookmarked ? "Remove Bookmark" : "Bookmark"}
          onClick={() => {
            ipc.main.send("workspaceApp.toggleBookmark", tab.id);
          }}
        >
          <StarIcon className={cn("size-3", tab.bookmarked && "fill-current")} />
        </Button>
      )}
      {isCloseable && (
        <Button
          variant="secondary"
          size="icon"
          data-sortable-action
          className={cn(
            "absolute opacity-0 transition-colors group-hover:opacity-100 focus-visible:opacity-100",
            isWideRow ? "inset-y-0 my-auto size-5" : "-top-1 -right-1 size-4 rounded-full",
            isWideRow && (isBookmarkable ? "right-7" : "right-1"),
          )}
          title="Close"
          onClick={() => {
            ipc.main.send("tabs.closeTab", accountId, tab.id);
          }}
        >
          <XIcon className="size-3" />
        </Button>
      )}
    </div>
  );
}

function SortableVerticalTab({
  tab,
  accountId,
  presentation,
  sectionIndex,
  gmailStatus,
  className,
}: {
  tab: TabState;
  accountId: AccountConfig["id"];
  presentation: "wideRow" | "narrowIcon" | "gridIcon";
  sectionIndex: number;
  gmailStatus?: GmailTabStatus;
  className?: string;
}) {
  const { ref, isDragging } = useSortable({
    id: tab.id,
    index: sectionIndex,
    disabled: tab.id === GMAIL_TAB_ID,
  });

  return (
    <VerticalTab
      ref={ref}
      tab={tab}
      accountId={accountId}
      presentation={presentation}
      gmailStatus={gmailStatus}
      className={cn("touch-none", isDragging && "opacity-50", className)}
    />
  );
}

/**
 * Opens the same popup the titlebar's bookmarks button does, hung beside the
 * strip rather than at the end of the titlebar so it comes up where it was asked
 * for. A popup rather than a dropdown because it is a child view, which paints
 * above the workspace app views a renderer-drawn list would be covered by.
 */
function VerticalTabsBookmarks({ isWide }: { isWide: boolean }) {
  return (
    <Button
      variant="ghost"
      size={isWide ? "sm" : "icon"}
      // Colours transition, the box never does, as in `VerticalTab`
      className={cn("text-muted-foreground transition-colors", isWide && "w-full justify-start")}
      title="Bookmarks"
      onClick={() => {
        ipc.main.send("bookmarks.togglePopup", "verticalTabs");
      }}
      onMouseEnter={() => {
        ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", false);
      }}
      onMouseLeave={() => {
        ipc.main.send("bookmarks.setPopupCloseOnBlurEnabled", true);
      }}
    >
      <BookOpenIcon />
      {isWide && "Bookmarks"}
    </Button>
  );
}

/**
 * Puts the strip on whichever of the two widths it is not on, so it can be
 * widened or narrowed where it stands rather than through settings. It leaves
 * the setting alone: the width is this account's for this run of the app.
 *
 * `default` rather than the `sm` its neighbours widen into, because that is the
 * one size that matches `icon`'s height and glyph. That width lands at once
 * too — the button's default `transition-all` would animate the box out of step
 * with the strip the click has already resized, so the transition names its
 * properties instead.
 *
 * An auto margin is what puts it at the foot: the tabs and the controls under
 * them take only the height they need.
 */
function VerticalTabsWidthToggle({
  accountId,
  isWide,
}: {
  accountId: AccountConfig["id"];
  isWide: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size={isWide ? "default" : "icon"}
      className={cn(
        "mt-auto text-muted-foreground transition-[color,background-color]",
        isWide && "w-full",
      )}
      title={isWide ? "Narrow Tabs" : "Wide Tabs"}
      onClick={() => {
        ipc.main.send("tabs.setVerticalTabsWidth", accountId, isWide ? "narrow" : "wide");
      }}
    >
      {isWide ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
    </Button>
  );
}

/**
 * What the pinned tabs have to leave the normal ones as the strip fills: the
 * rows the list has, up to three of them and the eight pixels of a fourth that
 * say it carries on past the three. A shorter list is left whole — the room
 * held for it is the room it fills, so none of it can stand empty between the
 * last tab and the launcher.
 *
 * The rows are measured here rather than left to the layout because the room is
 * held open from above, as a ceiling on the pinned tabs: see the section for
 * why it cannot be a floor under these ones.
 */
function getNormalSectionReservedHeight(normalTabCount: number, isWide: boolean) {
  if (normalTabCount === 0) {
    return 0;
  }

  // A row is the button and nothing besides: the narrow strip's `icon` at 32px,
  // the wide strip's `sm` at 28px. The tab's own box is a block around an
  // inline-flex button and so lays it on a line, but at the 16px over 24px the
  // strip inherits, that line's strut sits inside the button's own descent and
  // adds nothing to it. The room it has to do that in is four pixels in the
  // wide row and six in the narrow, measured against Inter: a face that hangs
  // further below its baseline, or a taller inherited line-height, would start
  // adding a pixel or two to a row here without anything failing to say so.
  // Nothing breaks when it does — the ceiling would hold a shade under three
  // rows open, and show a shade less of the fourth.
  const rowHeight = isWide ? 28 : 32;

  // As the section sets it between its rows
  const rowGap = isWide ? 4 : 8;

  const listHeight = normalTabCount * rowHeight + (normalTabCount - 1) * rowGap;

  const threeRowsAndASliver = rowHeight * 3 + rowGap * 2 + 8;

  return Math.min(listHeight, threeRowsAndASliver);
}

export function VerticalTabs() {
  const { config } = useConfig();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const {
    selectedAccount,
    tabs: selectedAccountTabs,
    width: verticalTabsWidth,
  } = useVerticalTabs();

  if (!selectedAccount || verticalTabsWidth === 0) {
    return;
  }

  const isWide = verticalTabsWidth === VERTICAL_TABS_WIDE_WIDTH;

  const pinnedSectionTabs = selectedAccountTabs.filter((tab) => getTabSection(tab) === "pinned");

  const normalTabs = selectedAccountTabs.filter((tab) => getTabSection(tab) === "normal");

  const normalSectionReservedHeight = getNormalSectionReservedHeight(normalTabs.length, isWide);

  const launcherApps = config?.["workspaceApps.launcherApps"] ?? [];

  const shouldShowWorkspaceAppsLauncher = isLicenseKeyValid && launcherApps.length > 0;

  const showsWidthToggle = config?.["verticalTabs.showWidthToggle"] ?? true;

  // Gmail is already in front while its tab is active, so the count can be
  // taken as read there. Attention is still flagged either way.
  const hidesUnreadCount =
    config?.["verticalTabs.hideUnreadBadgeWhenActive"] &&
    selectedAccountTabs.some((tab) => tab.id === GMAIL_TAB_ID && tab.active);

  const gmailTabStatus = {
    attentionRequired: selectedAccount.gmail.attentionRequired,
    unreadCount:
      config?.["accounts.unreadBadge"] && !hidesUnreadCount
        ? selectedAccount.gmail.unreadCount
        : null,
  };

  return (
    <div
      className={cn(
        // The one gutter on every edge of both widths is the narrow strip's own
        // measure: it leaves exactly an icon button's width between its sides,
        // which is what a 32px button centred in a 64px strip already sat on.
        // The column therefore hinges on its left edge as the strip resizes,
        // and the controls at the foot — the width toggle above all, which does
        // the resizing — stay put rather than stepping out from under the
        // pointer. The scrolling sections reach past that gutter and lay it out
        // again themselves, so a scrollbar can never take it from the column.
        "flex flex-col border-r p-4 select-none",
        isWide ? "gap-1" : "items-center gap-2",
      )}
      style={{ width: verticalTabsWidth, minWidth: verticalTabsWidth }}
      onContextMenu={(event) => {
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();

        ipc.main.send("tabs.showVerticalTabsContextMenu", selectedAccount.config.id);
      }}
    >
      {/*
       * The tabs take the height they come to and no more, so the launcher and
       * the bookmarks button carry on straight under the last of them rather
       * than being sent to the foot. What they give up, they give up to the
       * strip's own controls: those hold their height, and the tabs are the one
       * thing here that yields, which is what keeps them in the strip however
       * many are open.
       *
       * They then divide what is left between them in the pinned section's
       * favour. Pinning heavily therefore squeezes the normal tabs into a thin
       * scrolling column rather than costing the pinned ones a row, but it can
       * no longer squeeze them out of sight.
       */}
      <div className="flex min-h-0 w-full flex-col gap-2">
        <DragDropProvider
          plugins={sortablePlugins}
          sensors={sortableSensors}
          onDragEnd={(event) => {
            moveSectionTab(selectedAccount.config.id, pinnedSectionTabs, event);
          }}
        >
          {/*
           * Yields to nothing until the normal tabs are down to the room held
           * for them, and reaching that is the one case where this section
           * scrolls rather than takes the height it wants.
           *
           * That room is held open from up here, as a ceiling on this section
           * rather than a floor under that one. A floor would hold its room
           * open at rest as well, standing between the last tab and the
           * launcher, and being a minimum it could not give way on a window too
           * short to honour it — it would run the two sections over the very
           * controls this is all in aid of. A ceiling only ever takes room
           * away, so it can push nothing out of the strip; where the room held
           * isn't there to hold, it stands aside and the two sections halve
           * what there is between them. Its measure is the room plus the gap
           * over it, less the bleed below, and the two cancel.
           *
           * Both sections reach out to the strip's sides and set the gutter out
           * again inside themselves, so the scrollbar rides in the gutter
           * rather than over the tabs, and the column stands in the same place
           * whether there is one or not. The four pixels top and bottom are for
           * the badges the icons hang over their corners, which the edge a
           * scroll container clips at would otherwise shave off.
           */}
          <ScrollArea
            className="-mx-4 -my-1 shrink-0"
            style={{
              maxHeight: normalSectionReservedHeight
                ? `max(50%, calc(100% - ${normalSectionReservedHeight}px))`
                : "calc(100% + 0.5rem)",
            }}
          >
            <div
              className={cn(
                "px-4 py-1",
                isWide ? "grid grid-cols-2 gap-2" : "flex flex-col items-center gap-2",
              )}
            >
              {pinnedSectionTabs.map((tab, pinnedSectionTabIndex) => (
                <SortableVerticalTab
                  key={tab.id}
                  tab={tab}
                  accountId={selectedAccount.config.id}
                  presentation={isWide ? "gridIcon" : "narrowIcon"}
                  sectionIndex={pinnedSectionTabIndex}
                  gmailStatus={tab.id === GMAIL_TAB_ID ? gmailTabStatus : undefined}
                  className={cn(
                    isWide &&
                      pinnedSectionTabs.length % 2 === 1 &&
                      pinnedSectionTabIndex === 0 &&
                      "col-span-2",
                  )}
                />
              ))}
            </div>
          </ScrollArea>
        </DragDropProvider>
        {normalTabs.length > 0 && (
          <DragDropProvider
            plugins={sortablePlugins}
            sensors={sortableSensors}
            onDragEnd={(event) => {
              moveSectionTab(selectedAccount.config.id, normalTabs, event);
            }}
          >
            {/* The section that gives ground, no further than the ceiling above holds open for it */}
            <ScrollArea className="-mx-4 -my-1 min-h-0">
              <div
                className={cn("flex flex-col px-4 py-1", isWide ? "gap-1" : "items-center gap-2")}
              >
                {normalTabs.map((tab, normalTabIndex) => (
                  <SortableVerticalTab
                    key={tab.id}
                    tab={tab}
                    accountId={selectedAccount.config.id}
                    presentation={isWide ? "wideRow" : "narrowIcon"}
                    sectionIndex={normalTabIndex}
                  />
                ))}
              </div>
            </ScrollArea>
          </DragDropProvider>
        )}
      </div>
      {shouldShowWorkspaceAppsLauncher && (
        <div className={cn(HOST_HANDOVER_FADE_CLASS_NAME, isWide && "w-full")}>
          <VerticalTabsWorkspaceAppsLauncher launcherApps={launcherApps} isWide={isWide} />
        </div>
      )}
      <VerticalTabsBookmarks isWide={isWide} />
      {showsWidthToggle && (
        <VerticalTabsWidthToggle accountId={selectedAccount.config.id} isWide={isWide} />
      )}
    </div>
  );
}
