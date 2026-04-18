import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@meru/renderer-lib/react-query";

export function UnifiedInboxSettings() {
  const { config } = useConfig();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Unified Inbox</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label="Enabled"
            description="Show all unread messages from every account in a single unified inbox."
            configKey="unifiedInbox.enabled"
            licenseKeyRequired
            restartRequired
          />
          {config["unifiedInbox.enabled"] && (
            <ConfigSwitchField
              label="Show Sender Icons"
              description="Show sender icons next to the senders in the unified inbox."
              configKey="unifiedInbox.showSenderIcons"
              licenseKeyRequired
            />
          )}
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
