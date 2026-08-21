import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@/lib/react-query";

export function UnifiedInboxSettings() {
  const { config } = useConfig();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Unified inbox</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label="Enable unified inbox"
            description="Show all unread messages from every account in a single unified inbox."
            configKey="unifiedInbox.enabled"
            licenseKeyRequired
            restartRequired
          />
          {config["unifiedInbox.enabled"] && (
            <ConfigSwitchField
              label="Show sender icons"
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
