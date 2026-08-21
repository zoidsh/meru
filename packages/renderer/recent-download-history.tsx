import { MAX_RECENT_DOWNLOAD_HISTORY_ITEMS } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import { SquareArrowOutUpRightIcon, XIcon } from "lucide-react";
import { DownloadHistoryList } from "@/components/download-history";
import { Popup } from "@/components/popup";
import { renderApp } from "@/lib/react";

function RecentDownloadHistory() {
  return (
    <>
      <div className="p-4 font-semibold">Recent download history</div>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 size-7"
        onClick={() => {
          ipc.main.send("downloads.closeRecentDownloadHistoryPopup");
        }}
        title="Close"
      >
        <XIcon />
      </Button>
      <ScrollArea className="flex-1 overflow-hidden px-4">
        <div className="flex h-full flex-col">
          <DownloadHistoryList limit={MAX_RECENT_DOWNLOAD_HISTORY_ITEMS} />
        </div>
      </ScrollArea>
      <div className="mt-4 flex justify-end border-t bg-muted/50 p-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            ipc.main.send("downloads.openDownloadHistory");
          }}
        >
          <SquareArrowOutUpRightIcon /> Full download history
        </Button>
      </div>
    </>
  );
}

function RecentDownloadHistoryPopup() {
  return (
    <Popup
      onClose={() => {
        ipc.main.send("downloads.closeRecentDownloadHistoryPopup");
      }}
    >
      <RecentDownloadHistory />
    </Popup>
  );
}

renderApp(RecentDownloadHistoryPopup);
