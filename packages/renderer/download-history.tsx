import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import { XIcon } from "lucide-react";
import { DownloadHistory } from "@/components/download-history";
import { PopupWindow } from "@/components/popup-window";
import { renderApp } from "@/lib/react";
import { useConfig, useConfigMutation } from "@/lib/react-query";

function DownloadHistoryClearAllButton() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        configMutation.mutate({
          "downloads.history": [],
        });
      }}
      disabled={config["downloads.history"].length === 0}
    >
      Clear all
    </Button>
  );
}

function DownloadHistoryModal() {
  return (
    <div
      className="flex h-screen items-center justify-center bg-black/50"
      onClick={() => {
        ipc.main.send("downloads.closeDownloadHistoryPopup");
      }}
    >
      <div
        className="relative flex h-3/4 w-3/4 flex-col rounded-2xl border bg-background"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="p-4 font-semibold">Download History</div>
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 size-7"
          onClick={() => {
            ipc.main.send("downloads.closeDownloadHistoryPopup");
          }}
          title="Close"
        >
          <XIcon />
        </Button>
        <DownloadHistory />
        <div className="mt-4 flex justify-end border-t bg-muted/50 p-4">
          <DownloadHistoryClearAllButton />
        </div>
      </div>
    </div>
  );
}

function DownloadHistoryPopup() {
  return (
    <PopupWindow
      onClose={() => {
        ipc.main.send("downloads.closeDownloadHistoryPopup");
      }}
    >
      <DownloadHistoryModal />
    </PopupWindow>
  );
}

renderApp(DownloadHistoryPopup);
