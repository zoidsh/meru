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
import { Separator } from "@meru/ui/components/separator";
import { WorkspaceAppIcon } from "@meru/ui/components/workspace-app-icon";
import { cn } from "@meru/ui/lib/utils";
import { GlobeIcon, PlusIcon, XIcon } from "lucide-react";
import { type MouseEvent, useEffect, useState } from "react";
import { useIsLicenseKeyValid } from "@/lib/hooks";
import { useAccountsStore, useSettingsStore, useTabsStore } from "../lib/stores";

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

function StripTab({
  tab,
  accountId,
  presentation,
}: {
  tab: TabState;
  accountId: AccountConfig["id"];
  presentation: "wideRow" | "narrowIcon" | "gridIcon";
}) {
  const isCloseable = tab.id !== GMAIL_TAB_ID && !tab.pinned;

  const isWideRow = presentation === "wideRow";

  const canOpenSecondInstance =
    tab.app && !workspaceApps[tab.app].singleInstance && !workspaceApps[tab.app].alwaysOpenAsWindow;

  return (
    <div className="group relative">
      <Button
        variant={tab.active ? "secondary" : presentation === "gridIcon" ? "outline" : "ghost"}
        size={isWideRow ? "sm" : "icon"}
        className={cn(
          tab.dormant && "opacity-50",
          isWideRow && "w-full justify-start",
          isWideRow && isCloseable && "pr-7",
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
        {isWideRow && <span className="truncate">{tab.title}</span>}
      </Button>
      {isCloseable && (
        <Button
          variant="secondary"
          size="icon"
          className={cn(
            "absolute hidden group-hover:flex",
            isWideRow
              ? "top-1/2 right-1 size-5 -translate-y-1/2"
              : "-top-1 -right-1 size-4 rounded-full",
          )}
          title="Close Tab"
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

function getPinnedSectionGridColumnsClassName(pinnedSectionTabsCount: number) {
  if (pinnedSectionTabsCount === 1) {
    return "grid-cols-1";
  }

  if (pinnedSectionTabsCount % 2 === 0) {
    return "grid-cols-2";
  }

  return "grid-cols-3";
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
      )
    : 0;

  if (isSettingsOpen || !selectedAccount || !selectedAccountTabs || tabStripWidth === 0) {
    return;
  }

  const isWide = tabStripWidth === APP_TAB_STRIP_WIDE_WIDTH;

  const hasPinnedTabs = selectedAccountTabs.tabs.some((tab) => tab.pinned);

  const pinnedSectionTabs = selectedAccountTabs.tabs.filter(
    (tab) => tab.id === GMAIL_TAB_ID || tab.pinned,
  );

  const unpinnedTabs = selectedAccountTabs.tabs.filter(
    (tab) => tab.id !== GMAIL_TAB_ID && !tab.pinned,
  );

  const shouldRenderSeparator = !isWide && hasPinnedTabs && unpinnedTabs.length > 0;

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
        <div
          className={cn(
            "grid w-full gap-2",
            getPinnedSectionGridColumnsClassName(pinnedSectionTabs.length),
          )}
        >
          {pinnedSectionTabs.map((tab) => (
            <StripTab
              key={tab.id}
              tab={tab}
              accountId={selectedAccount.config.id}
              presentation="gridIcon"
            />
          ))}
        </div>
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
      {shouldRenderSeparator && <Separator className="data-horizontal:w-8" />}
      {unpinnedTabs.map((tab) => (
        <StripTab
          key={tab.id}
          tab={tab}
          accountId={selectedAccount.config.id}
          presentation={isWide ? "wideRow" : "narrowIcon"}
        />
      ))}
      <NewTabButton isWide={isWide} />
    </div>
  );
}
