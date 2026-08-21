import { FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { platform } from "@/lib/utils";

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
              <FieldLegend>Screen sharing</FieldLegend>
              <FieldGroup>
                <ConfigSwitchField
                  label="Use system picker"
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
                label="Hardware acceleration"
                description="Render with the GPU. This can improve performance, and can also cause compatibility problems on some systems."
                configKey="app.hardwareAcceleration"
                restartRequired
              />
              {platform.isMacOS && (
                <ConfigSwitchField
                  label="Use custom user agent"
                  description="Send a custom user agent for the Gmail and Workspace apps features that don't work with the default one. It resolves some problems and can cause others, so turn it off if the app becomes unstable."
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
