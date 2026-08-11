import { move } from "@dnd-kit/helpers";
import { type DragEndEvent, DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { VERTICAL_TABS_WIDE_WIDTH } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import type { AccountConfig } from "@meru/shared/schemas";
import { GMAIL_TAB_ID, getTabSection, type TabState } from "@meru/shared/tabs";
import { workspaceApps } from "@meru/shared/workspace-apps";
import { Button } from "@meru/ui/components/button";
import { cn } from "@meru/ui/lib/utils";
import { AppWindowIcon, BookOpenIcon, CircleAlertIcon, StarIcon, XIcon } from "lucide-react";
import type { Ref } from "react";
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

function WindowedTabBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute flex size-4 items-center justify-center rounded-full bg-secondary text-secondary-foreground",
        className,
      )}
    >
      <AppWindowIcon className="size-2.5" />
    </div>
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

  return (
    <div ref={ref} className={cn("group relative", className)}>
      <Button
        variant={tab.active ? "secondary" : !isWideRow && isPinnedSectionTab ? "outline" : "ghost"}
        size={isWideRow ? "sm" : "icon"}
        className={cn(
          tab.dormant && "opacity-50",
          isWideRow && "w-full justify-start",
          // The hover controls take their room instantly rather than over a
          // transition, which would slide the resting star out from under the
          // one that replaces it
          isWideRow && "transition-colors",
          isWideRow && isBookmarkable && "group-hover:pr-13",
          isWideRow && !isBookmarkable && isCloseable && "group-hover:pr-7",
          showsRestingStar && "pr-7",
          presentation === "gridIcon" && "w-full",
        )}
        title={tab.title}
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
        {isWideRow && tab.windowed && (
          <AppWindowIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
      </Button>
      {!isWideRow && tab.windowed && <WindowedTabBadge className="-right-1 -bottom-1" />}
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
            "absolute opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            isWideRow
              ? "inset-y-0 right-1 my-auto size-5 transition-colors"
              : "-top-1 -right-1 size-4 rounded-full",
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
      className={cn("text-muted-foreground", isWide && "w-full justify-start")}
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

  const gmailTabStatus = {
    attentionRequired: selectedAccount.gmail.attentionRequired,
    unreadCount: config?.["accounts.unreadBadge"] ? selectedAccount.gmail.unreadCount : null,
  };

  return (
    <div
      className={cn("flex flex-col border-r", isWide ? "gap-1 p-2" : "items-center gap-2 py-2")}
      style={{ width: verticalTabsWidth, minWidth: verticalTabsWidth }}
      onContextMenu={(event) => {
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();

        ipc.main.send("tabs.showVerticalTabsContextMenu", selectedAccount.config.id);
      }}
    >
      <DragDropProvider
        plugins={sortablePlugins}
        sensors={sortableSensors}
        onDragEnd={(event) => {
          moveSectionTab(selectedAccount.config.id, pinnedSectionTabs, event);
        }}
      >
        {isWide ? (
          <div className="mb-1 grid w-full grid-cols-2 gap-2">
            {pinnedSectionTabs.map((tab, pinnedSectionTabIndex) => (
              <SortableVerticalTab
                key={tab.id}
                tab={tab}
                accountId={selectedAccount.config.id}
                presentation="gridIcon"
                sectionIndex={pinnedSectionTabIndex}
                gmailStatus={tab.id === GMAIL_TAB_ID ? gmailTabStatus : undefined}
                className={cn(
                  pinnedSectionTabs.length % 2 === 1 && pinnedSectionTabIndex === 0 && "col-span-2",
                )}
              />
            ))}
          </div>
        ) : (
          pinnedSectionTabs.map((tab, pinnedSectionTabIndex) => (
            <SortableVerticalTab
              key={tab.id}
              tab={tab}
              accountId={selectedAccount.config.id}
              presentation="narrowIcon"
              sectionIndex={pinnedSectionTabIndex}
              gmailStatus={tab.id === GMAIL_TAB_ID ? gmailTabStatus : undefined}
            />
          ))
        )}
      </DragDropProvider>
      <DragDropProvider
        plugins={sortablePlugins}
        sensors={sortableSensors}
        onDragEnd={(event) => {
          moveSectionTab(selectedAccount.config.id, normalTabs, event);
        }}
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
      </DragDropProvider>
      {shouldShowWorkspaceAppsLauncher && (
        <div className={cn(HOST_HANDOVER_FADE_CLASS_NAME, isWide && "w-full")}>
          <VerticalTabsWorkspaceAppsLauncher launcherApps={launcherApps} isWide={isWide} />
        </div>
      )}
      <VerticalTabsBookmarks isWide={isWide} />
    </div>
  );
}
