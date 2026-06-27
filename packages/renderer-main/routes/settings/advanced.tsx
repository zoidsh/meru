import { platform } from "@meru/shared/renderer/utils";
import { FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";

export function AdvancedSettings() {
  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>Advanced</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          {platform.isMacOS && (
            <FieldSet>
              <FieldLegend>Screen Sharing</FieldLegend>
              <FieldGroup>
                <ConfigSwitchField
                  label="Use System Picker"
                  description="Use the system's native screen sharing picker when sharing your screen."
                  configKey="screenShare.useSystemPicker"
                  licenseKeyRequired
                  restartRequired
                />
              </FieldGroup>
            </FieldSet>
          )}
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Miscellaneous</FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label="Hardware Acceleration"
                description="Enabling hardware acceleration can improve performance but can also cause compatibility issues on some systems."
                configKey="app.hardwareAcceleration"
                restartRequired
              />
              {platform.isMacOS && (
                <ConfigSwitchField
                  label="Use Custom User Agent"
                  description="Some Gmail or Google app features may not work with the default user agent. Enabling this option will use a custom user agent and may help resolve issues, but can also cause others. Disable this option if you experience instability."
                  configKey="customUserAgent"
                  restartRequired
                />
              )}
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </SettingsContent>
    </Settings>
  );
}
