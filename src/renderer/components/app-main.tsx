import { useGmailToggleVisible, useGmailVisible } from "../lib/hooks";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { XIcon } from "lucide-react";
import { Accounts } from "./accounts";

export function AppMain() {
  const gmailVisible = useGmailVisible();

  const gmailToggleVisible = useGmailToggleVisible();

  if (gmailVisible.data) {
    return;
  }

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-sm mx-auto my-8 py-4 px-4 bg-background border rounded-md">
        <Accounts />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 absolute top-3 right-2"
        onClick={() => {
          gmailToggleVisible.mutate();
        }}
      >
        <XIcon />
      </Button>
    </ScrollArea>
  );
}
