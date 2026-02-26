import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";

export function UpdatesSettings() {
  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Updates</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <ConfigSwitchField
            label="Check For Updates Automatically"
            description="Automatically check for updates periodically."
            configKey="updates.autoCheck"
            restartRequired
          />
          <ConfigSwitchField
            label="Notify When Updates Are Available"
            description="Receive notifications when updates are available."
            configKey="updates.showNotifications"
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
