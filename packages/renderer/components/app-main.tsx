import { useLingui } from "@lingui/react/macro";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { cn } from "@meru/ui/lib/utils";
import { XIcon } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Route, useRoute } from "wouter";
import { navigate } from "wouter/use-hash-location";
import { DownloadHistory } from "@/routes/download-history";
import { UnifiedInbox } from "@/routes/unified-inbox";

/** Names the page it closes, since the same button closes both. */
function CloseButton({ label }: { label: string }) {
  const closePage = () => {
    navigate("/");
  };

  useHotkeys("esc", closePage);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={closePage}
        className="rounded-full"
        title={label}
      >
        <XIcon />
      </Button>
      <div className="text-xs font-semibold text-muted-foreground">
        {/* oxlint-disable-next-line lingui/no-unlocalized-strings -- the key's name as its keycap prints it */}
        Esc
      </div>
    </div>
  );
}

export function AppMain() {
  const { t } = useLingui();

  const [matchUnifiedInboxRoute] = useRoute("/unified-inbox");

  return (
    <div className="relative flex flex-1 bg-sidebar">
      <ScrollArea className="@container relative flex-1 overflow-hidden border bg-background dark:border-none">
        {/* Below its full width a column keeps 5rem a side, which clears the close button. */}
        <div
          className={cn(
            "mx-auto py-8",
            matchUnifiedInboxRoute ? "w-full max-w-6xl px-20 @6xl:px-8" : "max-w-2xl px-8",
          )}
        >
          <Route path="/unified-inbox" component={UnifiedInbox} />
          <Route path="/download-history" component={DownloadHistory} />
        </div>
        <div className="absolute top-8 right-8">
          <CloseButton
            label={matchUnifiedInboxRoute ? t`Close unified inbox` : t`Close download history`}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
