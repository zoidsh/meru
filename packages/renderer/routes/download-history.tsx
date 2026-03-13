import { useEffect } from "react";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useDownloadsStore } from "@/lib/stores";
import {
  DownloadHistoryClearAllButton,
  DownloadHistoryContent,
} from "@meru/renderer-popup/routes/download-history";

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
