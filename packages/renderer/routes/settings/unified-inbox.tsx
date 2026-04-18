import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";

export function UnifiedInboxSettings() {
  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Unified Inbox</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <FieldGroup>
          <ConfigSwitchField
            label="Enabled"
            description="Combine unread messages from all accounts into one inbox, accessible from the toolbar when multiple accounts are connected."
            configKey="unifiedInbox.enabled"
            restartRequired
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
