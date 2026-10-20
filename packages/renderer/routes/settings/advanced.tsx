import { Trans, useLingui } from "@lingui/react/macro";
import { FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@meru/ui/components/field";
import { ConfigSwitchField } from "@/components/config-switch-field";
import { LicenseKeyRequiredBanner } from "@/components/license-key-required-banner";
import { Settings, SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { settingsPageLabels } from "@/lib/settings-pages";
import { platform } from "@/lib/utils";

export function AdvancedSettings() {
  const { t } = useLingui();

  return (
    <Settings>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.advanced)}</SettingsTitle>
      </SettingsHeader>
      <SettingsContent>
        <LicenseKeyRequiredBanner />
        <FieldGroup>
          {platform.isMacOS && (
            <FieldSet>
              <FieldLegend>
                <Trans>Screen sharing</Trans>
              </FieldLegend>
              <FieldGroup>
                <ConfigSwitchField
                  label={t({
                    message: "Use system picker",
                    comment:
                      "Setting that shares the screen through the operating system's own picker",
                  })}
                  description={t`Use the system's native screen sharing picker when sharing your screen.`}
                  configKey="screenShare.useSystemPicker"
                  licenseKeyRequired
                  restartRequired
                />
              </FieldGroup>
            </FieldSet>
          )}
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>
              <Trans comment="Heading of the Settings section for settings that fit no other">
                Miscellaneous
              </Trans>
            </FieldLegend>
            <FieldGroup>
              <ConfigSwitchField
                label={t`Hardware acceleration`}
                description={t`Render with the GPU. This can improve performance, and can also cause compatibility problems on some systems.`}
                configKey="app.hardwareAcceleration"
                restartRequired
              />
              {platform.isMacOS && (
                <ConfigSwitchField
                  label={t`Use custom user agent`}
                  description={t`Send a custom user agent for the Gmail and Workspace apps features that don't work with the default one. It resolves some problems and can cause others, so turn it off if the app becomes unstable.`}
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
