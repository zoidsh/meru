import { APP_TAB_STRIP_WIDE_WIDTH } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import { GMAIL_TAB_ID, getTabStripWidth, type TabState } from "@meru/shared/types";
import { Button } from "@meru/ui/components/button";
import { WorkspaceAppIcon } from "@meru/ui/components/workspace-app-icon";
import { cn } from "@meru/ui/lib/utils";
import { CircleDashedIcon, GlobeIcon, XIcon } from "lucide-react";
import { useAccountsStore, useSettingsStore, useTabsStore } from "../lib/stores";

function TabIcon({ tab }: { tab: TabState }) {
  if (tab.app && tab.app !== "myaccount") {
    return <WorkspaceAppIcon app={tab.app} className="size-4" />;
  }

  return <GlobeIcon />;
}

export function AppTabStrip() {
  const accounts = useAccountsStore((state) => state.accounts);
  const accountsTabs = useTabsStore((state) => state.accountsTabs);
  const isSettingsOpen = useSettingsStore((state) => state.isOpen);

  const selectedAccount = accounts.find((account) => account.config.selected);

  const selectedAccountTabs = accountsTabs.find(
    (accountTabs) => accountTabs.accountId === selectedAccount?.config.id,
  );

  const tabStripWidth = selectedAccountTabs ? getTabStripWidth(selectedAccountTabs.tabs) : 0;

  if (isSettingsOpen || !selectedAccount || !selectedAccountTabs || tabStripWidth === 0) {
    return;
  }

  const isWide = tabStripWidth === APP_TAB_STRIP_WIDE_WIDTH;

  return (
    <div
      className={cn("flex flex-col border-r", isWide ? "gap-1 p-2" : "items-center gap-2 py-2")}
      style={{ width: tabStripWidth, minWidth: tabStripWidth }}
    >
      {selectedAccountTabs.tabs.map((tab) => (
        <div key={tab.id} className="group relative">
          <Button
            variant={tab.active ? "secondary" : "ghost"}
            size={isWide ? "sm" : "icon"}
            className={
              isWide
                ? cn(
                    "w-full justify-start",
                    ((tab.id !== GMAIL_TAB_ID && !tab.pinned) || tab.dormant) && "pr-7",
                  )
                : undefined
            }
            title={tab.title}
            onClick={() => {
              ipc.main.send("tabs.selectTab", selectedAccount.config.id, tab.id);
            }}
            onAuxClick={(event) => {
              if (event.button === 1 && tab.id !== GMAIL_TAB_ID && !tab.pinned) {
                ipc.main.send("tabs.closeTab", selectedAccount.config.id, tab.id);
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();

              ipc.main.send("tabs.showTabContextMenu", selectedAccount.config.id, tab.id);
            }}
          >
            <TabIcon tab={tab} />
            {isWide && <span className="truncate">{tab.title}</span>}
          </Button>
          {tab.dormant && (
            <CircleDashedIcon
              className={cn(
                "absolute text-muted-foreground",
                isWide ? "top-1/2 right-2 size-3.5 -translate-y-1/2" : "-top-1 -right-1 size-3.5",
              )}
            />
          )}
          {tab.id !== GMAIL_TAB_ID && !tab.pinned && (
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                "absolute hidden group-hover:flex",
                isWide
                  ? "top-1/2 right-1 size-5 -translate-y-1/2"
                  : "-top-1 -right-1 size-4 rounded-full",
              )}
              title="Close Tab"
              onClick={() => {
                ipc.main.send("tabs.closeTab", selectedAccount.config.id, tab.id);
              }}
            >
              <XIcon className="size-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
