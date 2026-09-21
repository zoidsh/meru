import { accountColorsMap } from "@meru/shared/accounts";
import { ipc } from "@meru/shared/renderer/ipc";
import type { AccountInstance } from "@meru/shared/schemas";
import { GMAIL_TAB_ID } from "@meru/shared/tabs";
import { Button } from "@meru/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { cn } from "@meru/ui/lib/utils";
import { InboxIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import { InboxTable } from "@/components/inbox-table";
import { useAccountInbox, useSelectedAccountTabs } from "@/lib/hooks";
import { useConfig } from "@/lib/react-query";

function AccountInbox({ account }: { account: AccountInstance }) {
  const { config } = useConfig();

  const { messages } = useAccountInbox(account.config.id);

  // The wake is a send with nothing to await, so the button holds this until
  // `gmailLoaded` arrives on the next accounts push and takes the whole view
  // away with it.
  const [isWaking, setIsWaking] = useState(false);

  const renderContent = () => {
    if (!config) {
      return;
    }

    if (messages.length === 0) {
      return (
        <div className="py-20">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>No unread messages</EmptyTitle>
              <EmptyDescription>
                New mail appears here while Gmail is unloaded. Open Gmail to see your whole inbox.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      );
    }

    return (
      <InboxTable
        messages={messages}
        rowsPerPage={config["unifiedInbox.rowsPerPage"]}
        showSenderIcons={config["unifiedInbox.showSenderIcons"]}
        showsAccountBadge={false}
      />
    );
  };

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={cn(
                "size-2 shrink-0 rounded-full",
                account.config.color ? accountColorsMap[account.config.color].className : "border",
              )}
            />
            <div className="truncate text-2xl font-semibold">{account.config.label}</div>
          </div>
          <Button
            disabled={isWaking}
            onClick={() => {
              setIsWaking(true);

              ipc.main.send("gmail.wake", account.config.id);
            }}
          >
            {isWaking ? (
              <>
                <LoaderCircleIcon className="animate-spin" />
                Opening Gmail…
              </>
            ) : (
              "Open Gmail"
            )}
          </Button>
        </div>
        {renderContent()}
      </div>
    </ScrollArea>
  );
}

/**
 * What an account on Hibernate Gmail shows in the rectangle its Gmail view
 * would paint in, there being no view to paint it. Only while the Gmail tab is
 * the active one: every other tab has a child view of its own, which main has
 * put on screen and which covers renderer HTML anyway.
 */
export function HibernatedGmailInbox() {
  const { selectedAccount, tabs } = useSelectedAccountTabs();

  if (!selectedAccount || !selectedAccount.hibernated || selectedAccount.gmailLoaded) {
    return;
  }

  // Asked the other way round, because the tabs push has not landed at first
  // paint and the Gmail tab is the active one until something else is: another
  // tab active means main has a child view over this rectangle, and drawing
  // under it would only cost the launch a frame of empty space.
  if (tabs.some((tab) => tab.active && tab.id !== GMAIL_TAB_ID)) {
    return;
  }

  // Keyed so that switching accounts starts the new one's inbox afresh rather
  // than handing it the page, the focused row and the pending wake of the last.
  return <AccountInbox key={selectedAccount.config.id} account={selectedAccount} />;
}
