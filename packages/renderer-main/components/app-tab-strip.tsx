import { APP_TAB_STRIP_WIDTH } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import { GMAIL_TAB_ID } from "@meru/shared/types";
import { Button } from "@meru/ui/components/button";
import { WorkspaceAppIcon } from "@meru/ui/components/workspace-app-icon";
import { GlobeIcon, MailIcon, XIcon } from "lucide-react";
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
      className="flex flex-col items-center gap-2 border-r py-2"
      style={{ width: APP_TAB_STRIP_WIDTH, minWidth: APP_TAB_STRIP_WIDTH }}
    >
      {selectedAccountTabs.tabs.map((tab) => {
        if (tab.id === GMAIL_TAB_ID) {
          return (
            <Button
              key={tab.id}
              variant={tab.active ? "secondary" : "ghost"}
              size="icon"
              title={tab.title}
              onClick={() => {
                ipc.main.send("tabs.selectTab", selectedAccount.config.id, tab.id);
              }}
            >
              <MailIcon />
            </Button>
          );
        }

        return (
          <div key={tab.id} className="group relative">
            <Button
              variant={tab.active ? "secondary" : "ghost"}
              size="icon"
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
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="absolute -top-1 -right-1 hidden size-4 rounded-full group-hover:flex"
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
