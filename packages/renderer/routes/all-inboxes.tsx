import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useUnifiedInbox } from "@/lib/hooks";
import { date } from "@meru/renderer-lib/date";
import { ipc } from "@meru/renderer-lib/ipc";
import { accountColorsMap } from "@meru/shared/accounts";
import { Badge } from "@meru/ui/components/badge";
import { Button } from "@meru/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meru/ui/components/select";
import { cn } from "@meru/ui/lib/utils";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";
import { navigate } from "wouter/use-hash-location";

const rowsPerPageItems = [
  { label: "10", value: "10" },
  { label: "15", value: "15" },
  { label: "20", value: "20" },
  { label: "25", value: "25" },
  { label: "30", value: "30" },
];

export function AllInboxes() {
  const unifiedInbox = useUnifiedInbox();

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>Unified Inbox</SettingsTitle>
      </SettingsHeader>
      <div className="text-sm border rounded-lg overflow-hidden">
        {unifiedInbox.messages.map((message) => (
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
            <div className="w-20">
              <Badge variant="secondary">
                {message.account.color && (
                  <div
                    className={cn(
                      "size-2 rounded-full",
                      accountColorsMap[message.account.color].className,
                    )}
                  />
                )}
                {message.account.label}
              </Badge>
            </div>
            <div
              className="w-36 truncate"
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
            <div className="text-muted-foreground whitespace-nowrap">
              {date(message.receivedAt).calendar()}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-4">
        <div></div>
        <div className="flex gap-8">
          <div className="flex gap-2 items-center">
            <div className="text-sm">Rows per page</div>
            <Select
              items={rowsPerPageItems}
              value={unifiedInbox.rowsPerPage}
              onValueChange={(value) => {
                if (value) {
                  unifiedInbox.setRowsPerPage(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rowsPerPageItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 items-center">
            <div className="text-sm">Page 1 of 4</div>
            <Button size="icon" variant="outline" onClick={unifiedInbox.goToFirstPage}>
              <ChevronsLeftIcon />
            </Button>
            <Button size="icon" variant="outline" onClick={unifiedInbox.previousPage}>
              <ChevronLeftIcon />
            </Button>
            <Button size="icon" variant="outline" onClick={unifiedInbox.nextPage}>
              <ChevronRightIcon />
            </Button>
            <Button size="icon" variant="outline" onClick={unifiedInbox.goToLastPage}>
              <ChevronsRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
