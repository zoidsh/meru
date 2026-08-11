import { Accessibility, defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import { type DragEndEvent, DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { VERTICAL_TABS_WIDE_WIDTH } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import type { AccountConfig, Bookmark } from "@meru/shared/schemas";
import { GMAIL_TAB_ID, getTabSection, type TabState } from "@meru/shared/tabs";
import { workspaceApps } from "@meru/shared/workspace-apps";
import { Button } from "@meru/ui/components/button";
import { cn } from "@meru/ui/lib/utils";
import { AppWindowIcon, CircleAlertIcon, StarIcon, XIcon } from "lucide-react";
import type { Ref } from "react";
import { TabIcon } from "@/components/tab-icon";
import { UnreadCountBadge } from "@/components/unread-count-badge";
import {
  VerticalTabsWorkspaceAppsLauncher,
  WORKSPACE_APPS_LAUNCHER_FADE_CLASS_NAME,
} from "@/components/workspace-apps-launcher";
import { useIsLicenseKeyValid, useVerticalTabs } from "@/lib/hooks";
import { useConfig } from "@/lib/react-query";
import { getModifierOpenBehavior } from "@/lib/workspace-apps";

const verticalTabsPlugins = defaultPreset.plugins.filter((plugin) => plugin !== Accessibility);

const verticalTabsSensors = [
  PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
    preventActivation: (event) =>
      event.target instanceof Element && event.target.closest("[data-tab-action]") !== null,
  }),
];

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

function moveBookmark(accountId: AccountConfig["id"], bookmarks: Bookmark[], event: DragEndEvent) {
  if (event.canceled) {
    return;
  }

  const bookmarkIds = bookmarks.map((bookmark) => bookmark.id);

  const movedBookmarkIds = move(bookmarkIds, event);

  if (movedBookmarkIds === bookmarkIds) {
    return;
  }

  const movedBookmarkId = event.operation.source?.id;

  if (typeof movedBookmarkId !== "string") {
    return;
  }

  ipc.main.send(
    "bookmarks.moveBookmark",
    accountId,
    movedBookmarkId,
    movedBookmarkIds.indexOf(movedBookmarkId),
  );
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

  const wideRowActionCount = (isBookmarkable ? 1 : 0) + (isCloseable ? 1 : 0);

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
          // The padding that clears room for the hover controls snaps rather
          // than animates: growing it over time drags the markers at the end of
          // the row along with it
          isWideRow && "transition-colors",
          isWideRow && wideRowActionCount === 1 && "group-hover:pr-7",
          isWideRow && wideRowActionCount === 2 && "group-hover:pr-13",
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
        {/*
         * A bookmarked row says so at rest, after the windowed marker and over
         * the toggle's own spot, so hovering swaps the two where they stand.
         */}
        {isBookmarkable && tab.bookmarked && (
          <StarIcon className="size-3 shrink-0 fill-current text-muted-foreground group-hover:hidden" />
        )}
      </Button>
      {!isWideRow && tab.windowed && <WindowedTabBadge className="-right-1 -bottom-1" />}
      {gmailStatus && <GmailTabStatusBadge {...gmailStatus} />}
      {/*
       * The toggle owns the row's right edge, landing on the marker above
       * rather than beside it: hovering a bookmarked row wraps the star it
       * already shows in a button instead of moving it. The close button only
       * ever shows on hover, so it takes the room to the left, where its coming
       * and going shifts nothing.
       */}
      {isBookmarkable && (
        <Button
          variant="secondary"
          size="icon"
          data-tab-action
          className="absolute top-1/2 right-1 size-5 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
          data-tab-action
          className={cn(
            "absolute opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            isWideRow
              ? cn("top-1/2 size-5 -translate-y-1/2", isBookmarkable ? "right-7" : "right-1")
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
 * A saved URL rather than an open tab: there is nothing to close, and opening
 * it loads the URL it was bookmarked at.
 */
function VerticalTabsBookmark({
  ref,
  bookmark,
  accountId,
  isWide,
  className,
}: {
  ref?: Ref<HTMLDivElement>;
  bookmark: Bookmark;
  accountId: AccountConfig["id"];
  isWide: boolean;
  className?: string;
}) {
  return (
    <div ref={ref} className={cn("group relative", className)}>
      <Button
        variant="ghost"
        size={isWide ? "sm" : "icon"}
        className={cn(isWide && "w-full justify-start group-hover:pr-7")}
        title={bookmark.title}
        onClick={() => {
          ipc.main.send("bookmarks.openBookmark", accountId, bookmark.id);
        }}
      >
        <TabIcon app={bookmark.app} />
        {isWide && (
          <span className="min-w-0 flex-1 overflow-hidden mask-r-from-[calc(100%-1.5rem)] text-left whitespace-nowrap">
            {bookmark.title}
          </span>
        )}
      </Button>
      <Button
        variant="secondary"
        size="icon"
        data-tab-action
        className={cn(
          "absolute opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          isWide
            ? "top-1/2 right-1 size-5 -translate-y-1/2"
            : "-top-1 -right-1 size-4 rounded-full",
        )}
        title="Remove Bookmark"
        onClick={() => {
          ipc.main.send("bookmarks.removeBookmark", accountId, bookmark.id);
        }}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}

function SortableVerticalTabsBookmark({
  bookmark,
  accountId,
  isWide,
  sectionIndex,
}: {
  bookmark: Bookmark;
  accountId: AccountConfig["id"];
  isWide: boolean;
  sectionIndex: number;
}) {
  const { ref, isDragging } = useSortable({
    id: bookmark.id,
    index: sectionIndex,
  });

  return (
    <VerticalTabsBookmark
      ref={ref}
      bookmark={bookmark}
      accountId={accountId}
      isWide={isWide}
      className={cn("touch-none", isDragging && "opacity-50")}
    />
  );
}

export function VerticalTabs() {
  const { config } = useConfig();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const {
    selectedAccount,
    tabs: selectedAccountTabs,
    bookmarks: selectedAccountBookmarks,
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
        plugins={verticalTabsPlugins}
        sensors={verticalTabsSensors}
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
        plugins={verticalTabsPlugins}
        sensors={verticalTabsSensors}
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
      <DragDropProvider
        plugins={verticalTabsPlugins}
        sensors={verticalTabsSensors}
        onDragEnd={(event) => {
          moveBookmark(selectedAccount.config.id, selectedAccountBookmarks, event);
        }}
      >
        {selectedAccountBookmarks.map((bookmark, bookmarkIndex) => (
          <SortableVerticalTabsBookmark
            key={bookmark.id}
            bookmark={bookmark}
            accountId={selectedAccount.config.id}
            isWide={isWide}
            sectionIndex={bookmarkIndex}
          />
        ))}
      </DragDropProvider>
      {shouldShowWorkspaceAppsLauncher && (
        <div className={cn(WORKSPACE_APPS_LAUNCHER_FADE_CLASS_NAME, isWide && "w-full")}>
          <VerticalTabsWorkspaceAppsLauncher launcherApps={launcherApps} isWide={isWide} />
        </div>
      )}
    </div>
  );
}
