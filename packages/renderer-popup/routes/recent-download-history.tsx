import { useTranslation } from "@meru/i18n/provider";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
import { Button } from "@meru/ui/components/button";
import { ScrollArea } from "@meru/ui/components/scroll-area";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@meru/ui/components/item";
import { DateFromNow } from "@meru/renderer/components/date-from-now";
import { DownloadIcon, FolderIcon, SquareArrowOutUpRightIcon, XIcon } from "lucide-react";
import { ipc } from "@meru/renderer-lib/ipc";
import { cn } from "@meru/ui/lib/utils";
import { MAX_RECENT_DOWNLOAD_HISTORY_ITEMS } from "@meru/shared/constants";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@meru/ui/components/empty";

export function RecentDownloadHistory() {
  const { t } = useTranslation();

  const { config } = useConfig();

  const configMutation = useConfigMutation();

  if (!config) {
    return;
  }

  const renderContent = () => {
    if (config["downloads.history"].length === 0) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DownloadIcon />
            </EmptyMedia>
            <EmptyTitle>{t("popup.downloadHistory.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("popup.downloadHistory.emptyDescription")}</EmptyDescription>
            <EmptyDescription>{t("popup.downloadHistory.emptyRetention")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <ScrollArea className="flex-1 px-4 overflow-hidden">
        <div className="space-y-2">
          {config["downloads.history"]
            .slice(0, MAX_RECENT_DOWNLOAD_HISTORY_ITEMS)
            .map(({ id, fileName, createdAt, filePath, exists }) => (
              <Item
                variant="outline"
                key={id}
                className={cn({
                  "hover:bg-muted/50 transition-colors": exists,
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
                      "line-through text-muted-foreground": !exists,
                    })}
                    title={fileName}
                  >
                    {fileName}
                  </ItemTitle>
                  <ItemDescription className="first-letter:capitalize">
                    {exists ? (
                      <DateFromNow timestamp={createdAt} />
                    ) : (
                      t("popup.downloadHistory.fileNotFound")
                    )}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {exists && (
                    <Button
                      size="sm"
                      variant="ghost"
                      title={t("popup.downloadHistory.showInFolder")}
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
                    title={t("popup.downloadHistory.removeFromHistory")}
                    onClick={(event) => {
                      event.stopPropagation();

                      configMutation.mutate({
                        "downloads.history": config["downloads.history"].filter(
                          (item) => item.id !== id,
                        ),
                      });
                    }}
                  >
                    <XIcon />
                  </Button>
                </ItemActions>
              </Item>
            ))}
        </div>
      </ScrollArea>
    );
  };

  return (
    <div className="h-screen flex flex-col border rounded-2xl">
      <div className="font-semibold p-4">{t("popup.downloadHistory.title")}</div>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 size-7"
        onClick={() => {
          ipc.main.send("downloads.closeRecentDownloadHistoryPopup");
        }}
        title={t("popup.downloadHistory.close")}
      >
        <XIcon />
      </Button>
      {renderContent()}
      <div className="bg-muted/50 border-t p-4 mt-4 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            ipc.main.send("downloads.openDownloadHistory");
          }}
        >
          <SquareArrowOutUpRightIcon /> {t("popup.downloadHistory.full")}
        </Button>
      </div>
    </div>
  );
}
