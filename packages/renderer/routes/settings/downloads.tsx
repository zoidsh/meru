import { ipc } from "@meru/renderer-lib/ipc";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@meru/ui/components/field";
import { Input } from "@meru/ui/components/input";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@meru/renderer-lib/react-query";
import { restartRequiredToast } from "@/lib/toast";
import { platform } from "@meru/renderer-lib/utils";

export function DownloadsSettings() {
  const { config } = useConfig();

  if (!config) {
    return null;
  }

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>Downloads</SettingsTitle>
      </SettingsHeader>
      <FieldGroup>
        <FieldSet>
          <FieldLegend>General</FieldLegend>
          <ConfigSwitchField
            label="Show Save As Dialog Before Downloading"
            description="Prompt for a location each time before a file is downloaded."
            configKey="downloads.saveAs"
            restartRequired
          />
          <ConfigSwitchField
            label="Open Folder When Done"
            description="Automatically open the folder containing the downloaded file when the download is complete."
            configKey="downloads.openFolderWhenDone"
            restartRequired
          />
          <Field>
            <FieldLabel>Default Download Location</FieldLabel>
            <FieldDescription>
              This is the default location where downloaded files are saved.
            </FieldDescription>
            <div className="flex gap-2">
              <Input value={config["downloads.location"]} readOnly />
              <Button
                variant="outline"
                onClick={async () => {
                  const { canceled } = await ipc.main.invoke("downloads.setLocation");

                  if (!canceled) {
                    restartRequiredToast();
                  }
                }}
              >
                Change
              </Button>
            </div>
          </Field>
        </FieldSet>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>Download History</FieldLegend>
          <ConfigSwitchField
            label="Always Open In A New Window"
            description={`Always open the download history in a new window instead of the main window. Hint: You can also open the download history in a new window by holding ${platform.isMacOS ? "Cmd" : "Ctrl"} while clicking the download history button in the app title bar.`}
            configKey="downloadHistory.alwaysOpenInNewWindow"
          />
        </FieldSet>
      </FieldGroup>
    </>
  );
}
