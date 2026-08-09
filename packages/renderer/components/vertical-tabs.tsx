import { Accessibility, defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import { type DragEndEvent, DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { VERTICAL_TABS_WIDE_WIDTH } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import type { AccountConfig } from "@meru/shared/schemas";
import { GMAIL_TAB_ID, getTabSection, type TabState } from "@meru/shared/tabs";
import { workspaceApps } from "@meru/shared/workspace-apps";
import { Button } from "@meru/ui/components/button";
import { cn } from "@meru/ui/lib/utils";
import { BookmarkIcon, CircleAlertIcon, GlobeIcon, XIcon } from "lucide-react";
import type { Ref } from "react";
import { UnreadCountBadge } from "@/components/unread-count-badge";
import { WorkspaceAppIcon } from "@/components/workspace-app-icon";
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
      event.target instanceof Element && event.target.closest("[data-tab-close]") !== null,
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

function TabIcon({ tab }: { tab: TabState }) {
  if (tab.app && tab.app !== "myaccount") {
    return <WorkspaceAppIcon app={tab.app} className="size-4" />;
  }

  return <GlobeIcon />;
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
          isWideRow && isCloseable && "group-hover:pr-7",
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
        <TabIcon tab={tab} />
        {isWideRow && (
          <span className="min-w-0 flex-1 overflow-hidden mask-r-from-[calc(100%-1.5rem)] text-left whitespace-nowrap">
            {tab.title}
          </span>
        )}
        {isWideRow && tab.persistence === "bookmarked" && (
          <BookmarkIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
      </Button>
      {gmailStatus && <GmailTabStatusBadge {...gmailStatus} />}
      {isCloseable && (
        <Button
          variant="secondary"
          size="icon"
          data-tab-close
          className={cn(
            "absolute opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            isWideRow
              ? "top-1/2 right-1 size-5 -translate-y-1/2"
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

  const bookmarkedTabs = selectedAccountTabs.filter((tab) => getTabSection(tab) === "bookmarks");

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
          moveSectionTab(selectedAccount.config.id, bookmarkedTabs, event);
        }}
      >
        {bookmarkedTabs.map((tab, bookmarkedTabIndex) => (
          <SortableVerticalTab
            key={tab.id}
            tab={tab}
            accountId={selectedAccount.config.id}
            presentation={isWide ? "wideRow" : "narrowIcon"}
            sectionIndex={bookmarkedTabIndex}
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
