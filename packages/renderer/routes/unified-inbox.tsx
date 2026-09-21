import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";
import { InboxIcon } from "lucide-react";
import { InboxTable } from "@/components/inbox-table";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useUnifiedInbox } from "@/lib/hooks";
import { useConfig } from "@/lib/react-query";

export function UnifiedInbox() {
  const { config } = useConfig();

  const unifiedInbox = useUnifiedInbox();

  const renderContent = () => {
    if (!config) {
      return;
    }

    if (unifiedInbox.messages.length === 0) {
      return (
        <div className="py-20">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>No unread messages</EmptyTitle>
              <EmptyDescription>
                The unified inbox shows every unread message from your accounts in one place. A
                message leaves the list after you read it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      );
    }

    return (
      <InboxTable
        messages={unifiedInbox.messages}
        rowsPerPage={config["unifiedInbox.rowsPerPage"]}
        showSenderIcons={config["unifiedInbox.showSenderIcons"]}
        showAccountBadge
      />
    );
  };

  return (
    <>
      <SettingsHeader className="flex-col">
        <SettingsTitle>Unified inbox</SettingsTitle>
      </SettingsHeader>
      {renderContent()}
    </>
  );
}
