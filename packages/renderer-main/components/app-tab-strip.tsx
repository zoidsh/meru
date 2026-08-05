import { Accessibility, defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import { type DragEndEvent, DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { APP_TAB_STRIP_WIDE_WIDTH } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import { useConfig } from "@meru/shared/renderer/react-query";
import { platform } from "@meru/shared/renderer/utils";
import type { AccountConfig } from "@meru/shared/schemas";
import { GMAIL_TAB_ID, getTabStripWidth, type TabState } from "@meru/shared/tabs";
import { bookmarkableWorkspaceApps, workspaceApps } from "@meru/shared/workspace-apps";
import { Button } from "@meru/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@meru/ui/components/dropdown-menu";
import { WorkspaceAppIcon } from "@meru/ui/components/workspace-app-icon";
import { cn } from "@meru/ui/lib/utils";
import { AppWindowIcon, GlobeIcon, PlusIcon, XIcon } from "lucide-react";
import { type MouseEvent, type Ref, useEffect, useState } from "react";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useAccountsStore, useSettingsStore, useTabsStore } from "../lib/stores";

const tabStripPlugins = defaultPreset.plugins.filter((plugin) => plugin !== Accessibility);

const tabStripSensors = [
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

function getModifierOpenBehavior(event: MouseEvent) {
  if (platform.isMacOS ? event.metaKey : event.ctrlKey) {
    return event.shiftKey ? "tab" : "backgroundTab";
  }

  if (event.shiftKey) {
    return "newWindow";
  }
}

function TabIcon({ tab }: { tab: TabState }) {
  if (tab.app && tab.app !== "myaccount") {
    return <WorkspaceAppIcon app={tab.app} className="size-4" />;
  }

  return <GlobeIcon />;
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

function StripTab({
  ref,
  tab,
  accountId,
  presentation,
  className,
}: {
  ref?: Ref<HTMLDivElement>;
  tab: TabState;
  accountId: AccountConfig["id"];
  presentation: "wideRow" | "narrowIcon" | "gridIcon";
  className?: string;
}) {
  const isPinnedSectionTab = tab.id === GMAIL_TAB_ID || tab.pinned;

  const isCloseable = !isPinnedSectionTab;

  const isWideRow = presentation === "wideRow";

  const canOpenSecondInstance =
    tab.app && !workspaceApps[tab.app].singleInstance && !workspaceApps[tab.app].alwaysOpenAsWindow;

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
        {isWideRow && tab.windowed && (
          <AppWindowIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
      </Button>
      {!isWideRow && tab.windowed && <WindowedTabBadge className="-right-1 -bottom-1" />}
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

function SortableStripTab({
  tab,
  accountId,
  presentation,
  sectionIndex,
  className,
}: {
  tab: TabState;
  accountId: AccountConfig["id"];
  presentation: "wideRow" | "gridIcon";
  sectionIndex: number;
  className?: string;
}) {
  const { ref, isDragging } = useSortable({
    id: tab.id,
    index: sectionIndex,
    disabled: tab.id === GMAIL_TAB_ID,
  });

  return (
    <StripTab
      ref={ref}
      tab={tab}
      accountId={accountId}
      presentation={presentation}
      className={cn("touch-none", isDragging && "opacity-50", className)}
    />
  );
}

function NewTabButton({ isWide }: { isWide: boolean }) {
  const { config } = useConfig();

  const isLicenseKeyValid = useIsLicenseKeyValid();

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleWindowBlur = () => {
      setIsOpen(false);
    };

    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isOpen]);

  if (!config || !isLicenseKeyValid || config["workspaceApps.bookmarkedApps"].length === 0) {
    return;
  }

  return (
    <div className={isWide ? "w-full" : undefined}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size={isWide ? "sm" : "icon"}
              className={cn("opacity-50 hover:opacity-100", isWide && "w-full")}
              title="New Tab"
            >
              <PlusIcon />
            </Button>
          }
        />
        <DropdownMenuContent
          side="bottom"
          align="start"
          className={cn("space-y-1", !isWide && "min-w-0")}
        >
          {config["workspaceApps.bookmarkedApps"].map((app) => (
            <DropdownMenuItem
              key={app}
              className={isWide ? undefined : "justify-center"}
              title={bookmarkableWorkspaceApps[app]}
              onClick={(event) => {
                ipc.main.send("workspaceApps.openApp", app, getModifierOpenBehavior(event));
              }}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  ipc.main.send("workspaceApps.openApp", app, "backgroundTab");

                  setIsOpen(false);
                }
              }}
            >
              <WorkspaceAppIcon app={app} className="size-4" />
              {isWide && bookmarkableWorkspaceApps[app]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AppTabStrip() {
  const accounts = useAccountsStore((state) => state.accounts);
  const accountsTabs = useTabsStore((state) => state.accountsTabs);
  const isSettingsOpen = useSettingsStore((state) => state.isOpen);

  const { config } = useConfig();

  const selectedAccount = accounts.find((account) => account.config.selected);

  const selectedAccountTabs = accountsTabs.find(
    (accountTabs) => accountTabs.accountId === selectedAccount?.config.id,
  );

  const tabStripWidth = selectedAccountTabs
    ? getTabStripWidth(
        selectedAccountTabs.tabs,
        (config?.["workspaceApps.bookmarkedApps"].length ?? 0) > 0,
        config?.["workspaceApps.tabStripWidth"] ?? "auto",
      )
    : 0;

  if (isSettingsOpen || !selectedAccount || !selectedAccountTabs || tabStripWidth === 0) {
    return;
  }

  const isWide = tabStripWidth === APP_TAB_STRIP_WIDE_WIDTH;

  const pinnedSectionTabs = selectedAccountTabs.tabs.filter(
    (tab) => tab.id === GMAIL_TAB_ID || tab.pinned,
  );

  const unpinnedTabs = selectedAccountTabs.tabs.filter(
    (tab) => tab.id !== GMAIL_TAB_ID && !tab.pinned,
  );

  return (
    <div
      className={cn("flex flex-col border-r", isWide ? "gap-1 p-2" : "items-center gap-2 py-2")}
      style={{ width: tabStripWidth, minWidth: tabStripWidth }}
      onContextMenu={(event) => {
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();

        ipc.main.send("tabs.showTabStripContextMenu", selectedAccount.config.id);
      }}
    >
      {isWide ? (
        <DragDropProvider
          plugins={tabStripPlugins}
          sensors={tabStripSensors}
          onDragEnd={(event) => {
            moveSectionTab(selectedAccount.config.id, pinnedSectionTabs, event);
          }}
        >
          <div className="mb-1 grid w-full grid-cols-2 gap-2">
            {pinnedSectionTabs.map((tab, pinnedSectionTabIndex) => (
              <SortableStripTab
                key={tab.id}
                tab={tab}
                accountId={selectedAccount.config.id}
                presentation="gridIcon"
                sectionIndex={pinnedSectionTabIndex}
                className={cn(
                  pinnedSectionTabs.length % 2 === 1 && pinnedSectionTabIndex === 0 && "col-span-2",
                )}
              />
            ))}
          </div>
        </DragDropProvider>
      ) : (
        pinnedSectionTabs.map((tab) => (
          <StripTab
            key={tab.id}
            tab={tab}
            accountId={selectedAccount.config.id}
            presentation="narrowIcon"
          />
        ))
      )}
      {isWide ? (
        <DragDropProvider
          plugins={tabStripPlugins}
          sensors={tabStripSensors}
          onDragEnd={(event) => {
            moveSectionTab(selectedAccount.config.id, unpinnedTabs, event);
          }}
        >
          {unpinnedTabs.map((tab, unpinnedTabIndex) => (
            <SortableStripTab
              key={tab.id}
              tab={tab}
              accountId={selectedAccount.config.id}
              presentation="wideRow"
              sectionIndex={unpinnedTabIndex}
            />
          ))}
        </DragDropProvider>
      ) : (
        unpinnedTabs.map((tab) => (
          <StripTab
            key={tab.id}
            tab={tab}
            accountId={selectedAccount.config.id}
            presentation="narrowIcon"
          />
        ))
      )}
      <NewTabButton isWide={isWide} />
    </div>
  );
}
