import { FieldGroup, FieldSeparator } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { useConfig } from "@/lib/react-query";

export function BlockerSettings() {
  const { config } = useConfig();

  if (!config) {
    return;
  }

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Blocker</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          <ConfigSwitchField
            label="Enable Blocker"
            description="Use blocker to improve your privacy by blocking unwanted content and network requests."
            configKey="blocker.enabled"
            licenseKeyRequired
            restartRequired
          />
          <FieldSeparator />
          <ConfigSwitchField
            label="Block Ads"
            description="Remove disruptive advertisements."
            configKey="blocker.ads"
            disabled={!config["blocker.enabled"]}
            licenseKeyRequired
            restartRequired
          />
          <ConfigSwitchField
            label="Block Trackers"
            description="Enhance your privacy."
            configKey="blocker.tracking"
            disabled={!config["blocker.enabled"]}
            licenseKeyRequired
            restartRequired
          />
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
