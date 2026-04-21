import { useTranslation } from "@meru/i18n/provider";
import { useEffect } from "react";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useDownloadsStore } from "@/lib/stores";
import { useConfig, useConfigMutation } from "@meru/renderer-lib/react-query";
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
import { ipc } from "@meru/renderer-lib/ipc";
import { DateFromNow } from "@/components/date-from-now";
import { cn } from "@meru/ui/lib/utils";

function DownloadHistoryClearAllButton() {
  const { t } = useTranslation();

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
      {t("downloadHistory.clearAll")}
    </Button>
  );
}

function DownloadHistoryContent() {
  const { t } = useTranslation();

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
          <EmptyTitle>{t("downloadHistory.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("downloadHistory.emptyDescription")}</EmptyDescription>
          <EmptyDescription>{t("downloadHistory.emptyRetention")}</EmptyDescription>
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
                {exists ? <DateFromNow timestamp={createdAt} /> : t("downloadHistory.fileNotFound")}
              </div>
            </div>
            <div className="flex gap-2">
              {exists && (
                <Button
                  size="icon"
                  variant="ghost"
                  title={t("downloadHistory.showInFolder")}
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
                title={t("downloadHistory.removeFromHistory")}
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
  const { t } = useTranslation();

  useEffect(() => {
    useDownloadsStore.setState({
      itemCompleted: null,
    });
  }, []);

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>{t("downloadHistory.title")}</SettingsTitle>
        <DownloadHistoryClearAllButton />
      </SettingsHeader>
      <DownloadHistoryContent />
    </>
  );
}
