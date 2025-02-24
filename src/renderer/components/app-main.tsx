import { useGmailVisible } from "../lib/hooks";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { XIcon } from "lucide-react";
import { Accounts } from "./accounts";
import { trpc } from "../lib/trpc";
import { APP_TOOLBAR_HEIGHT } from "@/lib/constants";

export function AppMain() {
  const gmailVisible = useGmailVisible();

  const gmailToggleVisible = trpc.gmail.toggleVisible.useMutation();

  if (gmailVisible.data) {
    return;
  }

  return (
    <ScrollArea className="flex-1">
      <div
        className="max-w-md mx-auto"
        style={{
          paddingTop: APP_TOOLBAR_HEIGHT,
          paddingBottom: APP_TOOLBAR_HEIGHT,
        }}
      >
        <Accounts />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 absolute top-1.5 right-2"
        onClick={() => {
          gmailToggleVisible.mutate();
        }}
      >
        <XIcon />
      </Button>
    </ScrollArea>
  );
}
