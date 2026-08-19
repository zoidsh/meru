import { Button } from "@meru/ui/components/button";
import { DownloadHistoryList } from "@/components/download-history";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig, useConfigMutation } from "@/lib/react-query";

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
      Clear All
    </Button>
  );
}

export function DownloadHistory() {
  return (
    <>
      <SettingsHeader>
        <SettingsTitle>Download History</SettingsTitle>
        <DownloadHistoryClearAllButton />
      </SettingsHeader>
      <DownloadHistoryList />
    </>
  );
}
