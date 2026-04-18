import { FieldGroup } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";

export function UnifiedInboxSettings() {
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
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
