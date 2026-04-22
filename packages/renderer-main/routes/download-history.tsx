import { useEffect } from "react";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useDownloadsStore } from "@/lib/stores";
import { useConfig, useConfigMutation } from "@meru/shared/renderer/react-query";
import { Button } from "@meru/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";
import { DownloadIcon, FolderIcon, XIcon } from "lucide-react";
import { Card, CardContent } from "@meru/ui/components/card";
import { ipc } from "@meru/shared/renderer/ipc";
import { DateFromNow } from "@/components/date-from-now";
import { cn } from "@meru/ui/lib/utils";

function DownloadHistoryClearAllButton() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  return (
    <Button
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

function DownloadHistoryContent() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  if (config["downloads.history"].length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <DownloadIcon />
          </EmptyMedia>
          <EmptyTitle>No downloads yet</EmptyTitle>
          <EmptyDescription>Your downloaded files will appear here.</EmptyDescription>
          <EmptyDescription>
            Downloads older than 30 days will be automatically removed from the history.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {config["downloads.history"].map(({ id, fileName, filePath, createdAt, exists }) => (
        <Card key={id}>
          <CardContent className="flex gap-4 items-center text-sm">
            <div className="flex-1 space-y-1">
              <div
                className={cn("font-medium", {
                  "hover:underline underline-offset-4": exists,
                  "line-through text-muted-foreground": !exists,
                })}
                onClick={
                  exists
                    ? () => {
                        ipc.main.send("downloads.openFile", { id, filePath });
                      }
                    : undefined
                }
                onDragStart={
                  exists
                    ? (event) => {
                        event.preventDefault();

                        ipc.main.send("downloads.dragFile", { id, filePath });
                      }
                    : undefined
                }
                draggable={exists}
              >
                {fileName}
              </div>
              <div className="text-muted-foreground first-letter:capitalize">
                {exists ? <DateFromNow timestamp={createdAt} /> : "File not found"}
              </div>
            </div>
            <div className="flex gap-2">
              {exists && (
                <Button
                  size="icon"
                  variant="ghost"
                  title="Show in folder"
                  onClick={() => {
                    ipc.main.send("downloads.showFileInFolder", { id, filePath });
                  }}
                >
                  <FolderIcon />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                title="Remove from history"
                onClick={() => {
                  configMutation.mutate({
                    "downloads.history": config["downloads.history"].filter(
                      (item) => item.id !== id,
                    ),
                  });
                }}
              >
                <XIcon />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DownloadHistory() {
  useEffect(() => {
    useDownloadsStore.setState({
      itemCompleted: null,
    });
  }, []);

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>Download History</SettingsTitle>
        <DownloadHistoryClearAllButton />
      </SettingsHeader>
      <DownloadHistoryContent />
    </>
  );
}
