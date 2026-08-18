import { ipc } from "@meru/shared/renderer/ipc";
import { Button } from "@meru/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@meru/ui/components/field";
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
        <FieldSet>
          <FieldLegend>General</FieldLegend>
          <ConfigSwitchField
            label="Show Save As Dialog Before Downloading"
            description="Ask where to save each file before it downloads."
            configKey="downloads.saveAs"
            restartRequired
          />
          <ConfigSwitchField
            label="Open Folder When Done"
            description="Open the folder containing the file when a download finishes."
            configKey="downloads.openFolderWhenDone"
            restartRequired
          />
          <Field>
            <FieldLabel>Default Download Location</FieldLabel>
            <FieldDescription>Where downloaded files are saved.</FieldDescription>
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
                Change…
              </Button>
            </div>
          </Field>
        </FieldSet>
      </FieldGroup>
    </>
  );
}
