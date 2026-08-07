import { MAX_RECENT_DOWNLOAD_HISTORY_ITEMS } from "@meru/shared/constants";
import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import { SquareArrowOutUpRightIcon, XIcon } from "lucide-react";
import { DownloadHistory } from "@/components/download-history";
import { PopupWindow } from "@/components/popup-window";
import { renderApp } from "@/lib/react";

function RecentDownloadHistory() {
  return (
    <div className="flex h-screen flex-col rounded-2xl border">
      <div className="p-4 font-semibold">Recent Download History</div>
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
      <DownloadHistory limit={MAX_RECENT_DOWNLOAD_HISTORY_ITEMS} />
      <div className="mt-4 flex justify-end border-t bg-muted/50 p-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            ipc.main.send("downloads.openDownloadHistoryPopup");
          }}
        >
          <SquareArrowOutUpRightIcon /> Full Download History
        </Button>
      </div>
    </div>
  );
}

function RecentDownloadHistoryPopup() {
  return (
    <PopupWindow
      onClose={() => {
        ipc.main.send("downloads.closeRecentDownloadHistoryPopup");
      }}
    >
      <RecentDownloadHistory />
    </PopupWindow>
  );
}

renderApp(RecentDownloadHistoryPopup);
