import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@meru/ui/components/item";
import { cn } from "@meru/ui/lib/utils";
import { DownloadIcon, FolderIcon, XIcon } from "lucide-react";
import { DateFromNow } from "@/components/date-from-now";
import { useConfig, useConfigMutation } from "@/lib/react-query";

export function DownloadHistoryList({ limit }: { limit?: number }) {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  const downloadHistory = config["downloads.history"];

  if (downloadHistory.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <DownloadIcon />
          </EmptyMedia>
          <EmptyTitle>No downloads yet</EmptyTitle>
          <EmptyDescription>Files you download appear here for 30 days.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-2">
      {(limit ? downloadHistory.slice(0, limit) : downloadHistory).map(
        ({ id, fileName, createdAt, filePath, exists }) => (
          <Item
            variant="outline"
            key={id}
            className={cn({
              "transition-colors hover:bg-muted/50": exists,
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
            <ItemContent className="overflow-hidden">
              <ItemTitle
                className={cn("block w-full truncate", {
                  "text-muted-foreground line-through": !exists,
                })}
                title={fileName}
              >
                {fileName}
              </ItemTitle>
              <ItemDescription className="first-letter:capitalize">
                {exists ? <DateFromNow timestamp={createdAt} /> : "File moved or deleted"}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              {exists && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Show in folder"
                  onClick={(event) => {
                    event.stopPropagation();

                    ipc.main.send("downloads.showFileInFolder", { id, filePath });
                  }}
                >
                  <FolderIcon />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                title="Remove from history"
                onClick={(event) => {
                  event.stopPropagation();

                  configMutation.mutate({
                    "downloads.history": downloadHistory.filter((item) => item.id !== id),
                  });
                }}
              >
                <XIcon />
              </Button>
            </ItemActions>
          </Item>
        ),
      )}
    </div>
  );
}
