import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useAllUnreadInboxes } from "@/lib/hooks";
import { date } from "@meru/renderer-lib/date";
import { ipc } from "@meru/renderer-lib/ipc";
import { Badge } from "@meru/ui/components/badge";
import { navigate } from "wouter/use-hash-location";

export function AllInboxes() {
  const allUnreadInboxes = useAllUnreadInboxes();
  console.log(allUnreadInboxes);
  return (
    <>
      <SettingsHeader>
        <SettingsTitle>Unified Inbox</SettingsTitle>
      </SettingsHeader>
      <div className="text-sm border rounded-lg overflow-hidden">
        {allUnreadInboxes.map((message) => (
          <div
            key={message.id}
            className="flex items-center gap-6 not-last:border-b p-3 whitespace-nowrap hover:bg-muted/50 transition-colors cursor-default"
            onClick={() => {
              navigate("/");

              ipc.main.send("settings.toggleIsOpen", false);

              ipc.main.send("accounts.selectAccount", message.account.id);

              ipc.main.send("gmail.openMessage", message.id);
            }}
          >
            <div className="w-24">
              <Badge variant="secondary">{message.account.label}</Badge>
            </div>
            <div
              className="w-36 truncate font-medium"
              title={`${message.sender.name} <${message.sender.email}>`}
            >
              {message.sender.name}
            </div>
            <div className="flex-1 flex gap-2 overflow-hidden">
              <div className="truncate shrink-0 max-w-xs font-medium" title={message.subject}>
                {message.subject}
              </div>
              <div className="text-muted-foreground truncate min-w-0" title={message.summary}>
                {message.summary}
              </div>
            </div>
            <div className="text-muted-foreground">{date(message.receivedAt).calendar()}</div>
          </div>
        ))}
      </div>
    </>
  );
}
