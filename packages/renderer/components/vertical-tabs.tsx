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
 * Two lanes becoming one: every link to the app opens in this tab. It takes the
 * corner opposite the windowed badge, so a tab that is both keeps each mark to
 * itself. Which app it stands for is left to the tab's tooltip — the tab keeps
 * the designation after browsing elsewhere, so the mark alone cannot say.
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
   * The same toggle a workspace app window carries in its titlebar: it saves the
   * URL the tab is on and empties again as the tab browses on. Only the wide row
   * has the space for it — the other presentations keep the context menu.
   */
  const isBookmarkable = isWideRow && !tab.dormant && Boolean(tab.app);

  /**
   * A bookmarked row shows its star at rest, on the row's edge, and hands that
   * spot over when pointed at: the star steps left, the close button takes the
   * edge. The room for one control is therefore held from the start.
   */
  const showsRestingStar = isBookmarkable && tab.bookmarked;

  const canOpenSecondInstance =
    tab.app && !workspaceApps[tab.app].singleInstance && !workspaceApps[tab.app].popupOnly;

  const showsAppLinksBadge = Boolean(
    config?.["verticalTabs.showAppLinksBadge"] && tab.opensLinksForApp,
  );

  /**
   * The mark on a designated tab cannot name the app it stands for, so the tab's
   * own tooltip does — and it keeps saying so once the badge is turned off.
   */
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
          // their room instantly rather than over a transition, which would
          // slide the resting star out from under the one that replaces it;
          // and the tab takes the shape its new presentation gives it in the
          // same step the strip changes width, rather than animating into it
          // once the strip has already arrived.
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
       * A bookmarked row keeps this button on show at rest, on the edge and
       * stripped back to its star, so the mark and the control it stands for
       * are one thing. Pointing at the row gives it back its button and moves
       * it left, clearing the edge for the close button.
       */}
      {isBookmarkable && (
        <Button
          variant="secondary"
          size="icon"
          data-sortable-action
          className={cn(
            // Centred with margins rather than a transform, which the button's
            // own press nudge would overwrite
            "absolute inset-y-0 my-auto size-5 transition-colors",
            tab.bookmarked
              ? "right-1 bg-transparent text-muted-foreground group-hover:right-7 group-hover:bg-secondary group-hover:text-secondary-foreground"
              : "right-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
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
            isWideRow ? "inset-y-0 right-1 my-auto size-5" : "-top-1 -right-1 size-4 rounded-full",
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
      // Colours transition, the box never does: the button takes its new width
      // in the same step the strip does rather than animating into it once the
      // strip has already arrived
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
 * the setting alone: the width is this account's for this run of the app, and
 * the setting — `auto` included — has the strip back on the next one, or as
 * soon as it is set again or the strip's context menu resets the width.
 *
 * The only control in the strip that goes without a label in either width: the
 * arrow it turns around already says which way the strip is about to go. In the
 * wide strip it takes the full row the controls above it take, but keeps that
 * arrow centred rather than dropping it into their icon column: with nothing to
 * the right of it, an icon column of one would only read as a label gone
 * missing, and centred it stays where the narrow strip has it.
 *
 * `default` rather than the `sm` its neighbours widen into, because that is the
 * one size that matches `icon`'s height and glyph: only the button's width may
 * change under the pointer that just resized the strip. That width lands at
 * once too — the button's default `transition-all` would animate the box and
 * its padding out of step with the strip the click has already resized,
 * dragging the arrow along, so the transition names its properties instead.
 *
 * Opacity is the one of them the button does animate: the strip is a column of
 * tabs, and a width the app is unlikely to be asked for twice in a sitting has
 * no business holding an arrow at the foot of it for good. Pointing anywhere at
 * the strip fades the arrow in, and leaving fades it back out — softly enough
 * that crossing the strip on the way somewhere else doesn't read as a flicker.
 * It holds its room in the column throughout, so the controls above it stay
 * where they are, and focus brings it back for the keyboard.
 *
 * An auto margin is what puts it at the foot: the tabs and the controls under
 * them take only the height they need, so this is the one thing in the strip
 * that has to be sent down to reach it.
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
        "mt-auto text-muted-foreground opacity-0 transition-[color,background-color,opacity] group-hover/vertical-tabs:opacity-100 focus-visible:opacity-100",
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

  const launcherApps = config?.["workspaceApps.launcherApps"] ?? [];

  const shouldShowWorkspaceAppsLauncher = isLicenseKeyValid && launcherApps.length > 0;

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
        // The group is named so that pointing at the strip reaches the width
        // toggle at its foot and nothing else: every tab row is an unnamed
        // group already, and an unnamed one here would hand each of them its
        // hover state at once, opening every close button in the column
        // together.
        //
        // The one gutter on every edge of both widths is the narrow strip's own
        // measure: it leaves exactly an icon button's width between its sides,
        // which is what a 32px button centred in a 64px strip already sat on.
        // The column therefore hinges on its left edge as the strip resizes,
        // and the controls at the foot — the width toggle above all, which does
        // the resizing — stay put rather than stepping out from under the
        // pointer. The scrolling sections reach past that gutter and lay it out
        // again themselves, so a scrollbar can never take it from the column.
        "group/vertical-tabs flex flex-col border-r p-4 select-none",
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
       * favour. The pinned tabs never yield — no ceiling, no share of the strip
       * they may not pass — and the normal tabs give up everything they have
       * first, so pinning heavily squeezes the normal tabs into a thin
       * scrolling column rather than costing the pinned ones a row.
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
           * Yields to nothing: the normal tabs give up everything they have
           * before a pinned row gives up a pixel. The one bound on it is the
           * height the two sections have between them, which it can only reach
           * once the normal tabs are down to nothing, and reaching it is the
           * single case where this section scrolls — so the pinned tabs can
           * never be what pushes the strip's controls out. That bound carries
           * the section's own bleed with it, the height it is measured against
           * being the one the bleed has already taken back.
           *
           * Both sections reach out to the strip's sides and set the gutter out
           * again inside themselves, so the scrollbar rides in the gutter
           * rather than over the tabs, and the column stands in the same place
           * whether there is one or not. The four pixels top and bottom are for
           * the badges the icons hang over their corners, which the edge a
           * scroll container clips at would otherwise shave off.
           */}
          <ScrollArea className="-mx-4 -my-1 max-h-[calc(100%+0.5rem)] shrink-0">
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
        {/*
         * Left out entirely while there is nothing to put in it, rather than
         * standing as an empty row's worth of space between the pinned tabs and
         * the launcher.
         */}
        {normalTabs.length > 0 && (
          <DragDropProvider
            plugins={sortablePlugins}
            sensors={sortableSensors}
            onDragEnd={(event) => {
              moveSectionTab(selectedAccount.config.id, normalTabs, event);
            }}
          >
            {/* The section that gives ground: it scrolls from the first row it cannot show */}
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
      <VerticalTabsWidthToggle accountId={selectedAccount.config.id} isWide={isWide} />
    </div>
  );
}
