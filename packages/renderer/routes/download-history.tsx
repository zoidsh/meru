import { Trans } from "@lingui/react/macro";
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
      <Trans comment="Button that clears the whole download history">Clear all</Trans>
    </Button>
  );
}

export function DownloadHistory() {
  return (
    <>
      <SettingsHeader>
        <SettingsTitle>
          <Trans>Download history</Trans>
        </SettingsTitle>
        <DownloadHistoryClearAllButton />
      </SettingsHeader>
      <DownloadHistoryList />
    </>
  );
}
