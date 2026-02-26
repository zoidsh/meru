import { ipc } from "@meru/renderer-lib/ipc";
import { Button } from "@meru/ui/components/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@meru/ui/components/field";
import { Input } from "@meru/ui/components/input";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@/lib/react-query";
import { restartRequiredToast } from "@/lib/toast";

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
      </FieldGroup>
    </>
  );
}
