import { APP_TAB_STRIP_WIDTH } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import { GMAIL_TAB_ID } from "@meru/shared/types";
import { Button } from "@meru/ui/components/button";
import { WorkspaceAppIcon } from "@meru/ui/components/workspace-app-icon";
import { GlobeIcon, XIcon } from "lucide-react";
import { useAccountsStore, useSettingsStore, useTabsStore } from "../lib/stores";

export function AppTabStrip() {
  const accounts = useAccountsStore((state) => state.accounts);
  const accountsTabs = useTabsStore((state) => state.accountsTabs);
  const isSettingsOpen = useSettingsStore((state) => state.isOpen);

  const selectedAccount = accounts.find((account) => account.config.selected);

  const selectedAccountTabs = accountsTabs.find(
    (accountTabs) => accountTabs.accountId === selectedAccount?.config.id,
  );

  if (
    isSettingsOpen ||
    !selectedAccount ||
    !selectedAccountTabs ||
    selectedAccountTabs.tabs.length <= 1
  ) {
    return;
  }

  return (
    <div
      className="flex flex-col gap-1 border-r p-2"
      style={{ width: APP_TAB_STRIP_WIDTH, minWidth: APP_TAB_STRIP_WIDTH }}
    >
      {selectedAccountTabs.tabs.map((tab) => {
        if (tab.id === GMAIL_TAB_ID) {
          return (
            <Button
              key={tab.id}
              variant={tab.active ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start"
              title={tab.title}
              onClick={() => {
                ipc.main.send("tabs.selectTab", selectedAccount.config.id, tab.id);
              }}
            >
              <WorkspaceAppIcon app="gmail" className="size-4" />
              <span className="truncate">{tab.title}</span>
            </Button>
          );
        }

        return (
          <div key={tab.id} className="group relative">
            <Button
              variant={tab.active ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start pr-7"
              title={tab.title}
              onClick={() => {
                ipc.main.send("tabs.selectTab", selectedAccount.config.id, tab.id);
              }}
            >
              {tab.app && tab.app !== "myaccount" ? (
                <WorkspaceAppIcon app={tab.app} className="size-4" />
              ) : (
                <GlobeIcon />
              )}
              <span className="truncate">{tab.title}</span>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-1/2 right-1 hidden size-5 -translate-y-1/2 group-hover:flex"
              title="Close Tab"
              onClick={() => {
                ipc.main.send("tabs.closeTab", selectedAccount.config.id, tab.id);
              }}
            >
              <XIcon className="size-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
